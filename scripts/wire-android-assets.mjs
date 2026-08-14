#!/usr/bin/env node
/**
 * Scales source assets from assets/ into android/app/src/main/res/ directories.
 * No external dependencies — uses the same hand-rolled PNG encoder as gen-assets.mjs.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const assetsDir = path.join(root, "assets");
const resDir = path.join(root, "android", "app", "src", "main", "res");

// ---------------------------------------------------------------------------
// PNG decode (subset — IHDR + IDAT only, no interlace, RGBA or RGB)
// ---------------------------------------------------------------------------

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function decodePNG(filePath) {
  const data = fs.readFileSync(filePath);
  let offset = 8; // skip signature

  let width = 0, height = 0, colorType = 0;
  const idatChunks = [];

  while (offset < data.length) {
    const len = data.readUInt32BE(offset); offset += 4;
    const type = data.toString("ascii", offset, offset + 4); offset += 4;
    const chunk = data.slice(offset, offset + len); offset += len;
    offset += 4; // skip CRC

    if (type === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      // chunk[8] = bit depth (assumed 8)
      colorType = chunk[9];
    } else if (type === "IDAT") {
      idatChunks.push(chunk);
    } else if (type === "IEND") {
      break;
    }
  }

  const compressed = Buffer.concat(idatChunks);
  const raw = zlib.inflateSync(compressed);

  const channels = colorType === 2 ? 3 : 4; // 2=RGB, 6=RGBA
  const stride = width * channels;
  const rgba = Buffer.alloc(width * height * 4);

  for (let y = 0; y < height; y++) {
    const filterByte = raw[y * (stride + 1)];
    const row = raw.slice(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    // Only handle filter type 0 (None) — gen-assets only emits type 0
    if (filterByte !== 0) throw new Error(`Unsupported PNG filter type ${filterByte} at row ${y}`);
    for (let x = 0; x < width; x++) {
      const src = x * channels;
      const dst = (y * width + x) * 4;
      rgba[dst]     = row[src];
      rgba[dst + 1] = row[src + 1];
      rgba[dst + 2] = row[src + 2];
      rgba[dst + 3] = channels === 4 ? row[src + 3] : 255;
    }
  }

  return { width, height, rgba };
}

// ---------------------------------------------------------------------------
// Box-filter resize
// ---------------------------------------------------------------------------

function resize(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4);
  const xScale = srcW / dstW;
  const yScale = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const x0 = dx * xScale;
      const x1 = (dx + 1) * xScale;
      const y0 = dy * yScale;
      const y1 = (dy + 1) * yScale;

      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          if (sx >= srcW || sy >= srcH) continue;
          const si = (sy * srcW + sx) * 4;
          const xw = Math.min(sx + 1, x1) - Math.max(sx, x0);
          const yw = Math.min(sy + 1, y1) - Math.max(sy, y0);
          const w = xw * yw;
          r += src[si]     * w;
          g += src[si + 1] * w;
          b += src[si + 2] * w;
          a += src[si + 3] * w;
          count += w;
        }
      }
      const di = (dy * dstW + dx) * 4;
      dst[di]     = Math.round(r / count);
      dst[di + 1] = Math.round(g / count);
      dst[di + 2] = Math.round(b / count);
      dst[di + 3] = Math.round(a / count);
    }
  }
  return dst;
}

// ---------------------------------------------------------------------------
// PNG encode (same as gen-assets.mjs)
// ---------------------------------------------------------------------------

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4); crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(w, 0); ihdrData.writeUInt32BE(h, 4);
  ihdrData[8] = 8; ihdrData[9] = 6;
  const ihdr = pngChunk("IHDR", ihdrData);
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 }));
  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

function writeScaled(src, srcW, srcH, outPath, dstW, dstH) {
  const scaled = resize(src, srcW, srcH, dstW, dstH);
  const png = encodePNG(dstW, dstH, scaled);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, png);
  console.log(`  wrote ${path.relative(root, outPath)} (${dstW}x${dstH})`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const icon = decodePNG(path.join(assetsDir, "icon.png"));
  const adaptiveIcon = decodePNG(path.join(assetsDir, "adaptive-icon.png"));
  const notifIcon = decodePNG(path.join(assetsDir, "notification-icon.png"));

  // Launcher icons — replace existing webp with PNG
  console.log("Launcher icons (mipmap):");
  const mipmapSizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
  for (const [density, size] of Object.entries(mipmapSizes)) {
    const dir = path.join(resDir, `mipmap-${density}`);
    // Remove stale webp files that would shadow PNG
    for (const stale of ["ic_launcher.webp", "ic_launcher_round.webp"]) {
      const p = path.join(dir, stale);
      if (fs.existsSync(p)) { fs.unlinkSync(p); console.log(`  removed ${density}/${stale}`); }
    }
    writeScaled(icon.rgba, icon.width, icon.height, path.join(dir, "ic_launcher.png"), size, size);
    writeScaled(icon.rgba, icon.width, icon.height, path.join(dir, "ic_launcher_round.png"), size, size);
  }

  // Adaptive icon foreground layer (separate mipmap file)
  console.log("Adaptive icon foreground:");
  for (const [density, size] of Object.entries(mipmapSizes)) {
    const dir = path.join(resDir, `mipmap-${density}`);
    writeScaled(adaptiveIcon.rgba, adaptiveIcon.width, adaptiveIcon.height,
      path.join(dir, "ic_launcher_foreground.png"), size, size);
  }

  // Notification icon (white silhouette, drawable dirs)
  console.log("Notification icons (drawable):");
  const notifSizes = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
  for (const [density, size] of Object.entries(notifSizes)) {
    writeScaled(notifIcon.rgba, notifIcon.width, notifIcon.height,
      path.join(resDir, `drawable-${density}`, "ic_notification.png"), size, size);
  }

  // Splash logo (centred motif, drawable dirs)
  // Re-use icon source (same motif) at larger sizes
  console.log("Splash logos (drawable):");
  const splashSizes = { mdpi: 200, hdpi: 300, xhdpi: 400, xxhdpi: 600, xxxhdpi: 800 };
  for (const [density, size] of Object.entries(splashSizes)) {
    writeScaled(icon.rgba, icon.width, icon.height,
      path.join(resDir, `drawable-${density}`, "splashscreen_logo.png"), size, size);
  }

  console.log("Done.");
}

main();
