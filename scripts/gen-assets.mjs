#!/usr/bin/env node
/**
 * Phase 14 — deterministic app-icon/splash/notification-icon asset generator.
 *
 * Draws a simple geometric "clock + random-dots" motif and encodes it to raw
 * PNG bytes by hand (RGBA scanlines -> zlib.deflateSync -> chunked PNG with a
 * hand-rolled CRC32). No canvas/sharp/jimp dependency — Node builtins only.
 *
 * Run with: node scripts/gen-assets.mjs
 * Re-running overwrites the same 4 files byte-identically (no timestamps are
 * ever written into the PNG stream).
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, "..", "assets");

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

const BG = [0x0f, 0x0f, 0x1a, 255]; // brand background
const ACCENT = [0x6c, 0x63, 0xff, 255]; // brand accent
const WHITE = [255, 255, 255, 255]; // notification silhouette

// ---------------------------------------------------------------------------
// Canvas primitives
// ---------------------------------------------------------------------------

/** Creates a WxH RGBA buffer, optionally pre-filled with `fill` (else fully transparent). */
function newCanvas(w, h, fill) {
  const buf = Buffer.alloc(w * h * 4);
  if (fill) {
    for (let i = 0; i < w * h; i++) {
      buf[i * 4] = fill[0];
      buf[i * 4 + 1] = fill[1];
      buf[i * 4 + 2] = fill[2];
      buf[i * 4 + 3] = fill[3];
    }
  }
  return buf;
}

function setPixel(buf, w, h, x, y, color) {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = (y * w + x) * 4;
  buf[i] = color[0];
  buf[i + 1] = color[1];
  buf[i + 2] = color[2];
  buf[i + 3] = color[3];
}

/** Hard-edged (no anti-aliasing) filled circle. */
function drawFilledCircle(buf, w, h, cx, cy, r, color) {
  const r2 = r * r;
  const minX = Math.max(0, Math.floor(cx - r));
  const maxX = Math.min(w - 1, Math.ceil(cx + r));
  const minY = Math.max(0, Math.floor(cy - r));
  const maxY = Math.min(h - 1, Math.ceil(cy + r));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) setPixel(buf, w, h, x, y, color);
    }
  }
}

/** Hard-edged ring (annulus) between rInner and rOuter. */
function drawRing(buf, w, h, cx, cy, rOuter, rInner, color) {
  const rOuter2 = rOuter * rOuter;
  const rInner2 = rInner * rInner;
  const minX = Math.max(0, Math.floor(cx - rOuter));
  const maxX = Math.min(w - 1, Math.ceil(cx + rOuter));
  const minY = Math.max(0, Math.floor(cy - rOuter));
  const maxY = Math.min(h - 1, Math.ceil(cy + rOuter));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 <= rOuter2 && d2 >= rInner2) setPixel(buf, w, h, x, y, color);
    }
  }
}

/** Hard-edged thick line (capsule) from (x0,y0) to (x1,y1). */
function drawThickLine(buf, w, h, x0, y0, x1, y1, thickness, color) {
  const half = thickness / 2;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - half));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(x0, x1) + half));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - half));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(y0, y1) + half));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      let t = lenSq === 0 ? 0 : ((px - x0) * dx + (py - y0) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
      const projX = x0 + t * dx;
      const projY = y0 + t * dy;
      const ddx = px - projX;
      const ddy = py - projY;
      if (ddx * ddx + ddy * ddy <= half * half) setPixel(buf, w, h, x, y, color);
    }
  }
}

// Fixed (deterministic) scatter positions for the "random dots" motif —
// expressed as fractions of `maxR` so they scale with each asset's size,
// always staying inside the shape's overall radius budget.
const SCATTER_DOTS = [
  { angle: 20, dist: 0.82, size: 0.085 },
  { angle: 95, dist: 0.74, size: 0.06 },
  { angle: 165, dist: 0.8, size: 0.07 },
  { angle: 235, dist: 0.72, size: 0.05 },
  { angle: 305, dist: 0.83, size: 0.075 },
];

/**
 * Draws a simple clock face (ring + 12 tick marks + two hands + hub) plus a
 * scatter of "random" dots, all confined to radius `maxR` from (cx, cy).
 */
function drawClockMotif(buf, w, h, cx, cy, maxR, color) {
  const ringOuter = maxR * 0.62;
  const ringInner = ringOuter - maxR * 0.1;
  drawRing(buf, w, h, cx, cy, ringOuter, ringInner, color);

  // 12 hour ticks
  const tickDist = ringOuter + maxR * 0.05;
  const tickR = maxR * 0.045;
  for (let i = 0; i < 12; i++) {
    const angle = (Math.PI * 2 * i) / 12 - Math.PI / 2;
    const tx = cx + Math.cos(angle) * tickDist;
    const ty = cy + Math.sin(angle) * tickDist;
    drawFilledCircle(buf, w, h, tx, ty, tickR, color);
  }

  // Hands (fixed angles — deterministic, no wall-clock time used)
  const minuteAngle = -Math.PI / 2 + Math.PI * 0.35;
  const hourAngle = -Math.PI / 2 - Math.PI * 0.55;
  const minuteLen = ringInner * 0.78;
  const hourLen = ringInner * 0.5;
  drawThickLine(
    buf, w, h, cx, cy,
    cx + Math.cos(minuteAngle) * minuteLen,
    cy + Math.sin(minuteAngle) * minuteLen,
    maxR * 0.045, color
  );
  drawThickLine(
    buf, w, h, cx, cy,
    cx + Math.cos(hourAngle) * hourLen,
    cy + Math.sin(hourAngle) * hourLen,
    maxR * 0.06, color
  );

  // Hub
  drawFilledCircle(buf, w, h, cx, cy, maxR * 0.055, color);

  // Random-dots motif, scattered around the face
  for (const d of SCATTER_DOTS) {
    const rad = (d.angle * Math.PI) / 180;
    const dx = cx + Math.cos(rad) * maxR * d.dist;
    const dy = cy + Math.sin(rad) * maxR * d.dist;
    drawFilledCircle(buf, w, h, dx, dy, maxR * d.size, color);
  }
}

// ---------------------------------------------------------------------------
// PNG encoding (RGBA, 8-bit, no interlace) — hand-rolled, no dependencies.
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Encodes an 8-bit RGBA buffer (w*h*4 bytes) as a PNG file buffer. */
function encodePNG(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 6; // color type: RGBA
  ihdrData[10] = 0; // compression method
  ihdrData[11] = 0; // filter method
  ihdrData[12] = 0; // interlace method
  const ihdr = pngChunk("IHDR", ihdrData);

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride);
  }
  // zlib.deflateSync produces a zlib stream (header + deflate + Adler32) with
  // no embedded timestamps — deterministic for identical input + options.
  const compressed = zlib.deflateSync(raw, { level: 9 });
  const idat = pngChunk("IDAT", compressed);

  const iend = pngChunk("IEND", Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

// ---------------------------------------------------------------------------
// Asset definitions
// ---------------------------------------------------------------------------

function buildIcon() {
  const w = 1024, h = 1024;
  const buf = newCanvas(w, h, BG);
  drawClockMotif(buf, w, h, w / 2, h / 2, 460, ACCENT);
  return { name: "icon.png", w, h, buf };
}

function buildAdaptiveIcon() {
  const w = 1024, h = 1024;
  // Transparent background; artwork confined well inside the centre 66%
  // safe zone (radius ~338 for a 1024 canvas) — we use maxR=300 for margin.
  const buf = newCanvas(w, h, null);
  drawClockMotif(buf, w, h, w / 2, h / 2, 300, ACCENT);
  return { name: "adaptive-icon.png", w, h, buf };
}

function buildSplash() {
  const w = 1242, h = 2436;
  const buf = newCanvas(w, h, BG);
  drawClockMotif(buf, w, h, w / 2, h / 2, 420, ACCENT);
  return { name: "splash.png", w, h, buf };
}

function buildNotificationIcon() {
  const w = 96, h = 96;
  // Transparent background; pure white silhouette, hard-edged (no
  // anti-aliasing) so every pixel is either fully white or fully transparent.
  const buf = newCanvas(w, h, null);
  drawClockMotif(buf, w, h, w / 2, h / 2, 40, WHITE);
  return { name: "notification-icon.png", w, h, buf };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const assets = [buildIcon(), buildAdaptiveIcon(), buildSplash(), buildNotificationIcon()];

  for (const asset of assets) {
    const png = encodePNG(asset.w, asset.h, asset.buf);
    const outPath = path.join(outDir, asset.name);
    fs.writeFileSync(outPath, png);
    console.log(`wrote ${asset.name} (${asset.w}x${asset.h}, ${png.length} bytes)`);
  }
}

main();
