/**
 * Tests for utils/scheduler.ts — surprise-me plan generation and energy mapping.
 */

import {
  planSurpriseMe,
  nudgeCountForEnergy,
  type ScatterInput,
} from "../utils/scheduler";

function makeTask(id: number, dayIso = "2026-04-01T00:00:00.000Z") {
  return { id, event_date: dayIso };
}

const TODAY = new Date(2026, 3, 25); // April 25, 2026 local

function baseInput(overrides: Partial<ScatterInput> = {}): ScatterInput {
  return {
    pendingTasks: [makeTask(1), makeTask(2), makeTask(3)],
    count: 3,
    today: TODAY,
    minSeconds: 9 * 3600, // 09:00
    maxSeconds: 17 * 3600 - 1, // 16:59:59
    weights: [],
    excluded: [],
    ...overrides,
  };
}

describe("planSurpriseMe", () => {
  it("returns an empty plan when there are no pending tasks", () => {
    const plan = planSurpriseMe(baseInput({ pendingTasks: [] }));
    expect(plan).toEqual([]);
  });

  it("returns an empty plan when count is 0 or negative", () => {
    expect(planSurpriseMe(baseInput({ count: 0 }))).toEqual([]);
    expect(planSurpriseMe(baseInput({ count: -1 }))).toEqual([]);
  });

  it("clamps count to the available pool size", () => {
    const plan = planSurpriseMe(baseInput({ count: 99 }));
    expect(plan).toHaveLength(3);
    const ids = plan.map((p) => p.taskId).sort();
    expect(ids).toEqual([1, 2, 3]);
  });

  it("selects exactly N tasks when count < pool size", () => {
    const plan = planSurpriseMe(
      baseInput({
        pendingTasks: [makeTask(1), makeTask(2), makeTask(3), makeTask(4), makeTask(5)],
        count: 2,
      })
    );
    expect(plan).toHaveLength(2);
    // Tasks must be unique (no duplicate IDs).
    const ids = plan.map((p) => p.taskId);
    expect(new Set(ids).size).toBe(ids.length);
    // Every picked id should exist in the source pool.
    for (const id of ids) {
      expect([1, 2, 3, 4, 5]).toContain(id);
    }
  });

  it("assigns new event dates that fall on `today` (year/month/day)", () => {
    const plan = planSurpriseMe(baseInput());
    for (const item of plan) {
      const d = new Date(item.newEventDateIso);
      expect(d.getFullYear()).toBe(TODAY.getFullYear());
      expect(d.getMonth()).toBe(TODAY.getMonth());
      expect(d.getDate()).toBe(TODAY.getDate());
    }
  });

  it("assigns times inside the supplied window", () => {
    const plan = planSurpriseMe(baseInput());
    for (const item of plan) {
      const d = new Date(item.newEventDateIso);
      const secondsOfDay = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
      expect(secondsOfDay).toBeGreaterThanOrEqual(9 * 3600);
      expect(secondsOfDay).toBeLessThanOrEqual(17 * 3600 - 1);
    }
  });

  it("respects excluded blocks", () => {
    // Lunch block: 12:00–13:00 — none of the picked times should land there.
    const plan = planSurpriseMe(
      baseInput({
        pendingTasks: Array.from({ length: 10 }, (_, i) => makeTask(i + 1)),
        count: 10,
        excluded: [{ startSeconds: 12 * 3600, endSeconds: 13 * 3600 - 1 }],
      })
    );
    for (const item of plan) {
      const d = new Date(item.newEventDateIso);
      const sec = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
      const inLunch = sec >= 12 * 3600 && sec < 13 * 3600;
      expect(inLunch).toBe(false);
    }
  });

  it("uses Fisher-Yates shuffle — over many trials each task is picked at least once", () => {
    // Statistical sanity: with pool of 5 and count=1, over 200 trials each of the
    // 5 tasks should be picked at least once.
    const picked = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const plan = planSurpriseMe(
        baseInput({
          pendingTasks: [makeTask(1), makeTask(2), makeTask(3), makeTask(4), makeTask(5)],
          count: 1,
        })
      );
      picked.add(plan[0].taskId);
    }
    expect(picked.size).toBe(5);
  });
});

describe("nudgeCountForEnergy", () => {
  it("returns 1 for low", () => {
    expect(nudgeCountForEnergy("low")).toBe(1);
  });

  it("returns 3 for medium", () => {
    expect(nudgeCountForEnergy("medium")).toBe(3);
  });

  it("returns 5 for high", () => {
    expect(nudgeCountForEnergy("high")).toBe(5);
  });

  it("defaults to 3 when null (unset)", () => {
    expect(nudgeCountForEnergy(null)).toBe(3);
  });
});
