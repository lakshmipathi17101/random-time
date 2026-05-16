/**
 * Tests for utils/streak.ts — streak calculation with the one-grace-per-7-days rule.
 */

import {
  calcStreak,
  calcStreakWithGrace,
  doneDayKeys,
} from "../utils/streak";

// Helper: build a Date at local midnight for a given y/m/d.
function d(y: number, m: number, day: number): Date {
  return new Date(y, m, day);
}

// Helper: build a Set of day keys from Date list.
function keys(dates: Date[]): Set<string> {
  return new Set(
    dates.map((dt) => `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`)
  );
}

describe("doneDayKeys", () => {
  it("only includes tasks with status='done'", () => {
    const tasks = [
      { status: "done", event_date: d(2026, 3, 20).toISOString() },
      { status: "pending", event_date: d(2026, 3, 21).toISOString() },
      { status: "done", event_date: d(2026, 3, 22).toISOString() },
    ];
    const result = doneDayKeys(tasks);
    expect(result.size).toBe(2);
    expect(result.has("2026-3-20")).toBe(true);
    expect(result.has("2026-3-22")).toBe(true);
    expect(result.has("2026-3-21")).toBe(false);
  });

  it("collapses multiple done tasks on the same day to a single key", () => {
    const tasks = [
      { status: "done", event_date: new Date(2026, 3, 20, 8).toISOString() },
      { status: "done", event_date: new Date(2026, 3, 20, 14).toISOString() },
      { status: "done", event_date: new Date(2026, 3, 20, 21).toISOString() },
    ];
    expect(doneDayKeys(tasks).size).toBe(1);
  });
});

describe("calcStreakWithGrace — basic cases", () => {
  it("returns 0 when today has no done task and no grace needed (empty)", () => {
    const today = d(2026, 3, 25);
    const { streak, graceUsed } = calcStreakWithGrace(keys([]), today);
    expect(streak).toBe(0);
    expect(graceUsed).toBe(false);
  });

  it("streak of 1 when only today is done", () => {
    const today = d(2026, 3, 25);
    const done = keys([today]);
    expect(calcStreakWithGrace(done, today).streak).toBe(1);
  });

  it("streak of 5 for 5 consecutive days including today", () => {
    const today = d(2026, 3, 25);
    const done = keys([
      d(2026, 3, 21),
      d(2026, 3, 22),
      d(2026, 3, 23),
      d(2026, 3, 24),
      d(2026, 3, 25),
    ]);
    expect(calcStreakWithGrace(done, today).streak).toBe(5);
  });

  it("does not count a gap with no grace used beyond the gap", () => {
    // done: 25, 24, 23, [miss 22], 21  → streak = 3 without grace.
    // With grace: 3 done + 1 grace consumed = keeps going = 4 done total? No —
    // a grace "keeps the chain alive" but doesn't add to the streak count.
    // So streak should be 4 (25, 24, 23 [gap on 22 grace] 21).
    const today = d(2026, 3, 25);
    const done = keys([
      d(2026, 3, 25),
      d(2026, 3, 24),
      d(2026, 3, 23),
      d(2026, 3, 21),
    ]);
    const result = calcStreakWithGrace(done, today);
    expect(result.streak).toBe(4);
    expect(result.graceUsed).toBe(true);
  });
});

describe("calcStreakWithGrace — grace rule", () => {
  it("grants at most one grace inside any 7-day window", () => {
    // Today is 25. Done on: 25, 23, 21. Missed 24, 22. First miss (24) is
    // forgiven; second miss (22) is inside the same 7-day window → chain breaks.
    // Expected streak = 2 (today 25 + 23 with grace on 24) — and then 22's miss
    // is unforgiven, so we stop before counting 21.
    const today = d(2026, 3, 25);
    const done = keys([d(2026, 3, 25), d(2026, 3, 23), d(2026, 3, 21)]);
    const result = calcStreakWithGrace(done, today);
    expect(result.streak).toBe(2);
    expect(result.graceUsed).toBe(true);
  });

  it("grants a second grace if it falls outside the 7-day window of the first", () => {
    // Dense run, then miss, then dense run, then miss, then dense run.
    // Today = day 20. Done on: 20,19,18,17,16,15,14 (7), miss 13, done 12,11,10,9,8,7 (6),
    // miss 6, done 5,4. First miss (13) is 7 days before (13 → 20 = 7 days). Second miss (6)
    // is 7 days before the second batch. If these graces are >= 7 days apart, both are allowed.
    const today = d(2026, 3, 20);
    const done = keys([
      d(2026, 3, 20),
      d(2026, 3, 19),
      d(2026, 3, 18),
      d(2026, 3, 17),
      d(2026, 3, 16),
      d(2026, 3, 15),
      d(2026, 3, 14),
      // miss 13 (grace #1)
      d(2026, 3, 12),
      d(2026, 3, 11),
      d(2026, 3, 10),
      d(2026, 3, 9),
      d(2026, 3, 8),
      d(2026, 3, 7),
      // miss 6 (grace #2 — 7 days after grace #1, at the edge)
      d(2026, 3, 5),
      d(2026, 3, 4),
    ]);
    const result = calcStreakWithGrace(done, today);
    // 7 + 6 + 2 = 15 done days; 2 graces consumed; stream extends through both miss days.
    // Streak count = done days only (graces don't add to the count).
    expect(result.streak).toBe(15);
    expect(result.graceUsed).toBe(true);
  });

  it("breaks chain when two misses are consecutive (back-to-back)", () => {
    // Today missed, yesterday missed → one grace covers today, second miss breaks.
    // Walk back: day 25 (miss) → spend grace → day 24 (miss) → no grace available → break.
    // Streak=0. graceUsed should also be false because the grace didn't save
    // any actual streak (nothing was counted before it ran out).
    const today = d(2026, 3, 25);
    const done = keys([d(2026, 3, 23), d(2026, 3, 22)]); // two done days 2-3 days ago
    const result = calcStreakWithGrace(done, today);
    expect(result.streak).toBe(0);
    expect(result.graceUsed).toBe(false);
  });

  it("does not consume grace on the first missed day if the streak has already ended", () => {
    // Done only far in the past — today missed, yesterday missed, day-before missed.
    // First miss uses grace. Second miss would require another grace within 7 days → break.
    const today = d(2026, 3, 25);
    const result = calcStreakWithGrace(keys([]), today);
    expect(result.streak).toBe(0);
  });
});

describe("calcStreak — legacy-compatible wrapper", () => {
  it("returns the streak number directly", () => {
    const today = d(2026, 3, 25);
    const tasks = [
      { status: "done", event_date: d(2026, 3, 25).toISOString() },
      { status: "done", event_date: d(2026, 3, 24).toISOString() },
      { status: "done", event_date: d(2026, 3, 23).toISOString() },
    ];
    expect(calcStreak(tasks, today)).toBe(3);
  });

  it("ignores non-done tasks", () => {
    const today = d(2026, 3, 25);
    const tasks = [
      { status: "pending", event_date: d(2026, 3, 25).toISOString() },
      { status: "pending", event_date: d(2026, 3, 24).toISOString() },
    ];
    expect(calcStreak(tasks, today)).toBe(0);
  });
});
