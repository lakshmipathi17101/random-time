/**
 * Random duration generator.
 *
 * Companion to `weightedRandom.ts`. Where the weighted-random engine picks a
 * single point-in-time, this picks a *length* — useful for time-boxing
 * ("commit to a 25–60 minute work block, but don't tell me which") and for
 * ADHD users who want to remove the negotiation step from "how long should
 * this take?".
 *
 * Pure / dependency-free so it unit-tests in isolation.
 */

/** Hard cap on input. Anything past 24 hours is almost certainly a typo. */
export const MAX_DURATION_MINUTES = 24 * 60;

export interface DurationBounds {
  /** Inclusive lower bound in whole minutes. */
  minMinutes: number;
  /** Inclusive upper bound in whole minutes. */
  maxMinutes: number;
}

/**
 * Pick a uniform random whole-minute duration in `[minMinutes, maxMinutes]`.
 *
 * Behaviour:
 *   - `min === max` returns `min` exactly.
 *   - `min > max` is silently swapped (caller error, not worth crashing).
 *   - Negative inputs are clamped to 0.
 *   - Values past `MAX_DURATION_MINUTES` are clamped down.
 *   - Non-integer inputs are floored to integers.
 */
export function generateRandomDuration(
  minMinutes: number,
  maxMinutes: number
): number {
  const a = clampMinutes(minMinutes);
  const b = clampMinutes(maxMinutes);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (lo === hi) return lo;
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

/**
 * Format a minute count as a short human label.
 *
 *   3   -> "3 min"
 *   45  -> "45 min"
 *   60  -> "1h"
 *   75  -> "1h 15m"
 *   120 -> "2h"
 *
 * Inputs <= 0 return "0 min" rather than empty string so the UI always has
 * *something* to render.
 */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "0 min";
  const total = Math.floor(minutes);
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Compute the wall-clock end time given a start `Date` and a duration in
 * minutes. Returns a new `Date`; does not mutate the input.
 */
export function endTime(start: Date, durationMinutes: number): Date {
  return new Date(start.getTime() + Math.max(0, durationMinutes) * 60 * 1000);
}

/**
 * Validate min/max for the UI. Returns null on OK, or a short error string
 * suitable for display.
 */
export function validateDurationBounds(b: DurationBounds): string | null {
  if (!Number.isFinite(b.minMinutes) || !Number.isFinite(b.maxMinutes)) {
    return "Enter whole minutes";
  }
  if (b.minMinutes < 0 || b.maxMinutes < 0) {
    return "Duration can't be negative";
  }
  if (b.minMinutes > b.maxMinutes) {
    return "Min must be ≤ max";
  }
  if (b.maxMinutes > MAX_DURATION_MINUTES) {
    return "Max can't exceed 24h";
  }
  return null;
}

function clampMinutes(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_DURATION_MINUTES, Math.max(0, Math.floor(n)));
}
