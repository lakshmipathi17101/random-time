/**
 * Unit tests for weightedRandom.ts
 * Deterministic where possible by stubbing Math.random.
 */

import {
  generateWeightedRandom,
  buildBiasConfig,
  hmsToSeconds,
  secondsToHms,
  WORK_HOURS_BIAS,
  LUNCH_BLOCK,
  SLEEP_BLOCKS,
} from "../weightedRandom";

/** Force Math.random() to return the supplied values in sequence, then 0.5 after. */
function stubRandomSequence(values: number[]): jest.SpyInstance {
  let i = 0;
  return jest
    .spyOn(Math, "random")
    .mockImplementation(() => (i < values.length ? values[i++] : 0.5));
}

afterEach(() => {
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
describe("hmsToSeconds / secondsToHms", () => {
  it("round-trips HH:MM:SS correctly", () => {
    const cases: [number, number, number][] = [
      [0, 0, 0],
      [9, 30, 0],
      [12, 0, 0],
      [23, 59, 59],
    ];
    for (const [h, m, s] of cases) {
      const total = hmsToSeconds(h, m, s);
      expect(secondsToHms(total)).toEqual({ h, m, s });
    }
  });

  it("hmsToSeconds is pure arithmetic", () => {
    expect(hmsToSeconds(1, 1, 1)).toBe(3600 + 60 + 1);
    expect(hmsToSeconds(0, 0, 0)).toBe(0);
    expect(hmsToSeconds(23, 59, 59)).toBe(86_399);
  });
});

// ---------------------------------------------------------------------------
// generateWeightedRandom — uniform fallback
// ---------------------------------------------------------------------------
describe("generateWeightedRandom (no bias)", () => {
  it("returns lo when lo === hi", () => {
    expect(generateWeightedRandom(5000, 5000, [], [])).toBe(5000);
  });

  it("returns a value within [lo, hi] with no weights or exclusions", () => {
    for (let i = 0; i < 50; i++) {
      const v = generateWeightedRandom(0, 100, [], []);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("swaps lo and hi if passed in reverse", () => {
    const v = generateWeightedRandom(100, 0, [], []);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });

  it("uses Math.random to draw uniformly", () => {
    stubRandomSequence([0]); // should produce lo
    expect(generateWeightedRandom(10, 20, [], [])).toBe(10);

    jest.restoreAllMocks();
    stubRandomSequence([0.9999999]); // should produce hi
    expect(generateWeightedRandom(10, 20, [], [])).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// generateWeightedRandom — weighted draw
// ---------------------------------------------------------------------------
describe("generateWeightedRandom (weighted)", () => {
  it("always picks from the only active weighted range", () => {
    const result = generateWeightedRandom(
      0,
      86_399,
      [{ startSeconds: 9 * 3600, endSeconds: 10 * 3600 - 1, weight: 1 }],
      []
    );
    expect(result).toBeGreaterThanOrEqual(9 * 3600);
    expect(result).toBeLessThanOrEqual(10 * 3600 - 1);
  });

  it("skips weights whose weight is zero", () => {
    // 0-weight range — engine should fall back to uniform across [lo,hi].
    stubRandomSequence([0]); // uniform lo
    const result = generateWeightedRandom(
      100,
      200,
      [{ startSeconds: 100, endSeconds: 150, weight: 0 }],
      []
    );
    expect(result).toBe(100);
  });

  it("skips weights that don't overlap the target range", () => {
    // Weight is entirely outside [lo=5000, hi=6000]. Engine should use uniform.
    stubRandomSequence([0.9999999]);
    const result = generateWeightedRandom(
      5000,
      6000,
      [{ startSeconds: 100, endSeconds: 200, weight: 5 }],
      []
    );
    expect(result).toBe(6000);
  });

  it("clamps a weighted range to [lo, hi]", () => {
    // Weight covers 0..20000 but range is 100..500. Result must be in 100..500.
    const result = generateWeightedRandom(
      100,
      500,
      [{ startSeconds: 0, endSeconds: 20_000, weight: 10 }],
      []
    );
    expect(result).toBeGreaterThanOrEqual(100);
    expect(result).toBeLessThanOrEqual(500);
  });

  it("distributes weight proportionally (statistical sanity check)", () => {
    // Range 0..100, two equal-sized weights: 0..49 and 50..100, ratio 10:1.
    // Expect ~91% of draws to land in the first range.
    const weights = [
      { startSeconds: 0, endSeconds: 49, weight: 10 },
      { startSeconds: 50, endSeconds: 100, weight: 1 },
    ];
    let firstCount = 0;
    const trials = 2000;
    for (let i = 0; i < trials; i++) {
      const v = generateWeightedRandom(0, 100, weights, []);
      if (v <= 49) firstCount++;
    }
    const ratio = firstCount / trials;
    // Expected ~0.909, allow a generous tolerance for statistical noise.
    expect(ratio).toBeGreaterThan(0.82);
    expect(ratio).toBeLessThan(0.97);
  });
});

// ---------------------------------------------------------------------------
// generateWeightedRandom — excluded blocks
// ---------------------------------------------------------------------------
describe("generateWeightedRandom (excluded blocks)", () => {
  it("avoids a single excluded block across many draws", () => {
    const excluded = [{ startSeconds: 50, endSeconds: 60 }];
    for (let i = 0; i < 500; i++) {
      const v = generateWeightedRandom(0, 100, [], excluded);
      expect(v >= 50 && v <= 60).toBe(false);
    }
  });

  it("avoids multiple excluded blocks", () => {
    const excluded = [
      { startSeconds: 10, endSeconds: 20 },
      { startSeconds: 40, endSeconds: 50 },
      { startSeconds: 80, endSeconds: 90 },
    ];
    for (let i = 0; i < 500; i++) {
      const v = generateWeightedRandom(0, 100, [], excluded);
      expect(
        excluded.some((b) => v >= b.startSeconds && v <= b.endSeconds)
      ).toBe(false);
    }
  });

  it("falls back to uniform when every slot is excluded (does not hang)", () => {
    const excluded = [{ startSeconds: 0, endSeconds: 100 }]; // entire range
    const v = generateWeightedRandom(0, 100, [], excluded);
    // No valid slot; engine returns a fallback uniform draw. Just assert it returns a number in-range.
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// buildBiasConfig — flag-to-config mapping
// ---------------------------------------------------------------------------
describe("buildBiasConfig", () => {
  it("returns empty lists when all flags are false", () => {
    const cfg = buildBiasConfig({
      workHoursBias: false,
      skipLunch: false,
      skipSleep: false,
    });
    expect(cfg.weights).toEqual([]);
    expect(cfg.excluded).toEqual([]);
  });

  it("adds WORK_HOURS_BIAS when workHoursBias is true", () => {
    const cfg = buildBiasConfig({
      workHoursBias: true,
      skipLunch: false,
      skipSleep: false,
    });
    expect(cfg.weights).toContain(WORK_HOURS_BIAS);
    expect(cfg.excluded).toEqual([]);
  });

  it("adds LUNCH_BLOCK when skipLunch is true", () => {
    const cfg = buildBiasConfig({
      workHoursBias: false,
      skipLunch: true,
      skipSleep: false,
    });
    expect(cfg.excluded).toContain(LUNCH_BLOCK);
  });

  it("adds both SLEEP_BLOCKS when skipSleep is true", () => {
    const cfg = buildBiasConfig({
      workHoursBias: false,
      skipLunch: false,
      skipSleep: true,
    });
    expect(cfg.excluded).toEqual(SLEEP_BLOCKS);
  });

  it("composes all three flags together", () => {
    const cfg = buildBiasConfig({
      workHoursBias: true,
      skipLunch: true,
      skipSleep: true,
    });
    expect(cfg.weights).toHaveLength(1);
    expect(cfg.excluded).toHaveLength(3); // 1 lunch + 2 sleep
  });
});

// ---------------------------------------------------------------------------
// End-to-end bias sanity check
// ---------------------------------------------------------------------------
describe("generateWeightedRandom + buildBiasConfig (integration)", () => {
  it("work-hours-biased draws land in 9-17 much more often than uniform would", () => {
    const cfg = buildBiasConfig({
      workHoursBias: true,
      skipLunch: false,
      skipSleep: false,
    });
    let inWorkHours = 0;
    const trials = 1000;
    for (let i = 0; i < trials; i++) {
      const s = generateWeightedRandom(0, 86_399, cfg.weights, cfg.excluded);
      if (s >= 9 * 3600 && s < 17 * 3600) inWorkHours++;
    }
    // Uniform would be ~33% (8h out of 24h). With weight 3 vs default uniform,
    // expectation is meaningfully higher — assert just > 40% to avoid flakes.
    expect(inWorkHours / trials).toBeGreaterThan(0.4);
  });

  it("skip-lunch never lands in 12-13", () => {
    const cfg = buildBiasConfig({
      workHoursBias: false,
      skipLunch: true,
      skipSleep: false,
    });
    for (let i = 0; i < 500; i++) {
      const s = generateWeightedRandom(0, 86_399, cfg.weights, cfg.excluded);
      expect(s >= 12 * 3600 && s < 13 * 3600).toBe(false);
    }
  });
});
