/**
 * Weighted random time generator.
 *
 * Standard uniform random is fine for "any time at all", but people usually
 * want bias: "more likely during work hours", "never during lunch", "avoid
 * sleep times". This module lets the caller describe that bias declaratively
 * and returns a single second-of-day value drawn from the shaped distribution.
 *
 * The engine is intentionally dependency-free so it can be unit-tested in
 * isolation (jest-expo mocks are not required).
 */

export interface WeightedRange {
  /** Inclusive lower bound in seconds-from-midnight (0 .. 86_399). */
  startSeconds: number;
  /** Inclusive upper bound in seconds-from-midnight. */
  endSeconds: number;
  /** Relative weight. A range with weight 2 is twice as likely as weight 1. Must be > 0 to take effect. */
  weight: number;
}

export interface ExcludedBlock {
  /** Inclusive lower bound in seconds-from-midnight. */
  startSeconds: number;
  /** Inclusive upper bound in seconds-from-midnight. */
  endSeconds: number;
}

const MAX_ATTEMPTS = 200;

/**
 * Draw one random second-of-day value in `[minSeconds, maxSeconds]`, biased by
 * `weights` and avoiding any `excluded` block when possible.
 *
 * Algorithm:
 *   1. If any weight overlaps the range, pick a weight proportional to its
 *      weight (weighted choice), then draw uniformly within its intersection
 *      with `[minSeconds, maxSeconds]`.
 *   2. If no weights apply, draw uniformly across the whole range.
 *   3. If the draw lands in an excluded block, retry up to `MAX_ATTEMPTS`.
 *   4. If every attempt is excluded (e.g. degenerate config where the entire
 *      range is excluded), fall back to a uniform draw ignoring exclusions so
 *      the caller still gets a finite answer.
 */
export function generateWeightedRandom(
  minSeconds: number,
  maxSeconds: number,
  weights: WeightedRange[],
  excluded: ExcludedBlock[]
): number {
  const lo = Math.min(minSeconds, maxSeconds);
  const hi = Math.max(minSeconds, maxSeconds);
  if (lo === hi) return lo;

  const activeWeights = weights.filter(
    (w) => w.endSeconds >= lo && w.startSeconds <= hi && w.weight > 0
  );

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const candidate =
      activeWeights.length > 0
        ? pickFromWeightedRanges(activeWeights, lo, hi)
        : uniformRandom(lo, hi);
    if (!isExcluded(candidate, excluded)) {
      return candidate;
    }
  }

  // Fallback: every attempt fell into an excluded block. Return a uniform draw
  // without the exclusion constraint rather than looping forever.
  return uniformRandom(lo, hi);
}

function pickFromWeightedRanges(
  ranges: WeightedRange[],
  lo: number,
  hi: number
): number {
  const total = ranges.reduce((sum, r) => sum + r.weight, 0);
  let roll = Math.random() * total;

  let chosen = ranges[0];
  for (const range of ranges) {
    roll -= range.weight;
    if (roll <= 0) {
      chosen = range;
      break;
    }
  }

  const rangeMin = Math.max(chosen.startSeconds, lo);
  const rangeMax = Math.min(chosen.endSeconds, hi);
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

/** Convert HH:MM:SS to total seconds. */
export function hmsToSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s;
}

/** Convert seconds-from-midnight into HH:MM:SS components. */
export function secondsToHms(totalSeconds: number): {
  h: number;
  m: number;
  s: number;
} {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h, m, s };
}

// ---------------------------------------------------------------------------
// Built-in bias presets — lightweight flags the UI can toggle without needing
// to expose the full WeightedRange/ExcludedBlock data model to the user yet.
// ---------------------------------------------------------------------------

/** 9:00–17:00 inclusive carries extra weight vs. the rest of the range. */
export const WORK_HOURS_BIAS: WeightedRange = {
  startSeconds: 9 * 3600,
  endSeconds: 17 * 3600 - 1,
  weight: 3,
};

/** Skip 12:00–13:00 inclusive (lunch). */
export const LUNCH_BLOCK: ExcludedBlock = {
  startSeconds: 12 * 3600,
  endSeconds: 13 * 3600 - 1,
};

/** Skip 22:00–07:00 (sleep). Wraps midnight so it's represented as two blocks. */
export const SLEEP_BLOCKS: ExcludedBlock[] = [
  { startSeconds: 22 * 3600, endSeconds: 24 * 3600 - 1 },
  { startSeconds: 0, endSeconds: 7 * 3600 - 1 },
];

export interface BiasFlags {
  workHoursBias: boolean;
  skipLunch: boolean;
  skipSleep: boolean;
}

/**
 * Convert UI toggle flags into the weight + exclusion lists the engine expects.
 * Kept separate so the engine stays testable without React coupling.
 */
export function buildBiasConfig(flags: BiasFlags): {
  weights: WeightedRange[];
  excluded: ExcludedBlock[];
} {
  const weights: WeightedRange[] = [];
  const excluded: ExcludedBlock[] = [];
  if (flags.workHoursBias) weights.push(WORK_HOURS_BIAS);
  if (flags.skipLunch) excluded.push(LUNCH_BLOCK);
  if (flags.skipSleep) excluded.push(...SLEEP_BLOCKS);
  return { weights, excluded };
}
