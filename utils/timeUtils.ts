export function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function timeToSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s;
}

export function secondsToTime(totalSeconds: number): {
  h: number;
  m: number;
  s: number;
} {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h, m, s };
}

export function formatTime24(h: number, m: number, s: number): string {
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatTime12(h: number, m: number, s: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${pad(h12)}:${pad(m)}:${pad(s)} ${period}`;
}

export function parseVal(v: string, max: number): number {
  const n = parseInt(v, 10);
  if (isNaN(n)) return 0;
  return clamp(n, 0, max);
}
