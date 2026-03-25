import { WeightedRange, ExcludedBlock } from "./db";

/**
 * Generate a random time (in seconds from midnight) within [minSeconds, maxSeconds],
 * respecting weighted sub-ranges and excluded blocks.
 *
 * Algorithm:
 * 1. If weighted ranges are provided and overlap [min,max], pick a range
 *    proportionally to its weight, then pick uniformly within that range.
 * 2. If the candidate falls inside an excluded block, retry (up to MAX_ATTEMPTS).
 * 3. After MAX_ATTEMPTS, fall back to uniform random with no exclusions.
 */

const MAX_ATTEMPTS = 200;

export function generateWeightedRandom(
  minSeconds: number,
  maxSeconds: number,
  weights: WeightedRange[],
  excluded: ExcludedBlock[]
): number {
  // Clamp and validate
  const lo = Math.min(minSeconds, maxSeconds);
  const hi = Math.max(minSeconds, maxSeconds);
  if (lo === hi) return lo;

  // Filter weights that actually overlap the [lo, hi] range
  const activeWeights = weights.filter(
    (w) => w.endSeconds > lo && w.startSeconds < hi && w.weight > 0
  );

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let candidate: number;

    if (activeWeights.length > 0) {
      candidate = pickFromWeightedRanges(activeWeights, lo, hi);
    } else {
      candidate = uniformRandom(lo, hi);
    }

    if (!isExcluded(candidate, excluded)) {
      return candidate;
    }
  }

  // Fallback: uniform random ignoring excluded (better than hanging)
  return uniformRandom(lo, hi);
}

function pickFromWeightedRanges(
  ranges: WeightedRange[],
  lo: number,
  hi: number
): number {
  const totalWeight = ranges.reduce((sum, r) => sum + r.weight, 0);
  let rand = Math.random() * totalWeight;

  let selected = ranges[0];
  for (const range of ranges) {
    rand -= range.weight;
    if (rand <= 0) {
      selected = range;
      break;
    }
  }

  // Clamp the selected range to [lo, hi]
  const rangeMin = Math.max(selected.startSeconds, lo);
  const rangeMax = Math.min(selected.endSeconds, hi);
  return uniformRandom(rangeMin, rangeMax);
}

function uniformRandom(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function isExcluded(seconds: number, excluded: ExcludedBlock[]): boolean {
  return excluded.some(
    (block) => seconds >= block.startSeconds && seconds <= block.endSeconds
  );
}

/** Convert HH:MM:SS strings to seconds */
export function hmsToSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s;
}

/** Convert seconds to { h, m, s } */
export function secondsToHms(totalSeconds: number): { h: number; m: number; s: number } {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h, m, s };
}

/** Format seconds as "HH:MM" for display in excluded block / weighted range labels */
export function secondsToLabel(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
