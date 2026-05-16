/**
 * Phase 10 — streak calculation with a forgiveness rule.
 *
 * Rule: walking backwards from `today`, a day counts toward the streak if
 *   (a) at least one task was marked `done` that day, OR
 *   (b) a "grace day" is available. A grace day is available once per rolling
 *       7-day window (i.e. we may consume at most one grace inside any
 *       7-consecutive-day slice of the streak we're about to build).
 *
 * The streak ends on the first day that is BOTH
 *   - missed (no done tasks that day), AND
 *   - would consume a grace day when none is available.
 *
 * Exported helpers are pure and deterministic — they take `today` as an
 * argument so tests can freeze time without stubbing Date.
 */

export interface StreakResult {
  streak: number;
  graceUsed: boolean;
}

/** Format a Date as a local-timezone YYYY-M-D key (matches legacy calcStreak). */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Build a set of day keys from "done" tasks.
 * Only tasks with status === "done" contribute.
 */
export function doneDayKeys<T extends { status: string; event_date: string }>(
  tasks: T[]
): Set<string> {
  const set = new Set<string>();
  for (const t of tasks) {
    if (t.status !== "done") continue;
    set.add(dayKey(new Date(t.event_date)));
  }
  return set;
}

/**
 * Compute the current streak using the grace rule described above.
 *
 * @param doneDays  Set of local-day keys on which at least one task was done.
 * @param today     Reference point (defaults to `new Date()`).
 */
export function calcStreakWithGrace(
  doneDays: Set<string>,
  today: Date = new Date()
): StreakResult {
  // Walk backwards from today. Track how many grace days we've consumed inside
  // the 7-day window ending on each day we've examined.
  let streak = 0;
  let graceConsumed = false;
  // Timestamps (ms) of each grace-day consumption — used to enforce
  // "at most one grace per rolling 7-day window".
  const graceTimestamps: number[] = [];

  const cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // Cap the walk at 3 years to guarantee termination even on pathological input.
  const MAX_STEPS = 365 * 3;

  for (let i = 0; i < MAX_STEPS; i++) {
    const key = dayKey(cursor);
    const didIt = doneDays.has(key);

    if (didIt) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    // Missed day. Can we spend a grace?
    const cursorMs = cursor.getTime();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const recentGrace = graceTimestamps.some(
      (g) => Math.abs(g - cursorMs) < sevenDaysMs
    );

    if (recentGrace) {
      // No grace available in this window → streak ends here.
      break;
    }

    // Spend a grace day. Streak continues but we don't increment
    // (missed day doesn't add to the count — it just doesn't break the chain).
    graceTimestamps.push(cursorMs);
    graceConsumed = true;
    cursor.setDate(cursor.getDate() - 1);
  }

  // graceUsed is only meaningful if the grace actually preserved a
  // non-zero streak. If streak is 0, no chain existed to save.
  return { streak, graceUsed: graceConsumed && streak > 0 };
}

/**
 * Convenience wrapper that accepts raw tasks and returns just the streak number.
 * Matches the legacy `calcStreak` signature from App.tsx so it's a drop-in.
 */
export function calcStreak<
  T extends { status: string; event_date: string }
>(tasks: T[], today: Date = new Date()): number {
  return calcStreakWithGrace(doneDayKeys(tasks), today).streak;
}
