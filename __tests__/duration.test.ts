import {
  MAX_DURATION_MINUTES,
  endTime,
  formatDuration,
  generateRandomDuration,
  validateDurationBounds,
} from "../utils/duration";

describe("generateRandomDuration", () => {
  it("returns the value exactly when min === max", () => {
    expect(generateRandomDuration(15, 15)).toBe(15);
    expect(generateRandomDuration(0, 0)).toBe(0);
  });

  it("returns an integer in [min, max]", () => {
    for (let i = 0; i < 200; i++) {
      const v = generateRandomDuration(5, 20);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(5);
      expect(v).toBeLessThanOrEqual(20);
    }
  });

  it("swaps reversed bounds rather than crashing", () => {
    for (let i = 0; i < 50; i++) {
      const v = generateRandomDuration(60, 30);
      expect(v).toBeGreaterThanOrEqual(30);
      expect(v).toBeLessThanOrEqual(60);
    }
  });

  it("clamps negatives to zero", () => {
    expect(generateRandomDuration(-10, 0)).toBe(0);
  });

  it("clamps above MAX_DURATION_MINUTES", () => {
    const v = generateRandomDuration(MAX_DURATION_MINUTES, MAX_DURATION_MINUTES + 999);
    expect(v).toBe(MAX_DURATION_MINUTES);
  });

  it("floors non-integer inputs", () => {
    for (let i = 0; i < 50; i++) {
      const v = generateRandomDuration(2.7, 4.9);
      // After flooring -> [2, 4]
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(4);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  it("can hit both endpoints over many trials", () => {
    let sawLo = false;
    let sawHi = false;
    for (let i = 0; i < 500 && !(sawLo && sawHi); i++) {
      const v = generateRandomDuration(0, 3);
      if (v === 0) sawLo = true;
      if (v === 3) sawHi = true;
    }
    expect(sawLo).toBe(true);
    expect(sawHi).toBe(true);
  });
});

describe("formatDuration", () => {
  it("shows minutes under an hour", () => {
    expect(formatDuration(0)).toBe("0 min");
    expect(formatDuration(1)).toBe("1 min");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(59)).toBe("59 min");
  });

  it("collapses whole hours", () => {
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(120)).toBe("2h");
    expect(formatDuration(180)).toBe("3h");
  });

  it("formats hours + minutes", () => {
    expect(formatDuration(75)).toBe("1h 15m");
    expect(formatDuration(125)).toBe("2h 5m");
  });

  it("handles bad input gracefully", () => {
    expect(formatDuration(-5)).toBe("0 min");
    expect(formatDuration(NaN)).toBe("0 min");
    expect(formatDuration(Infinity)).toBe("0 min");
  });

  it("floors fractional input", () => {
    expect(formatDuration(15.9)).toBe("15 min");
    expect(formatDuration(60.5)).toBe("1h");
  });
});

describe("endTime", () => {
  it("adds duration to start", () => {
    const start = new Date("2026-04-27T10:00:00Z");
    const end = endTime(start, 30);
    expect(end.getTime() - start.getTime()).toBe(30 * 60 * 1000);
  });

  it("does not mutate start", () => {
    const start = new Date("2026-04-27T10:00:00Z");
    const t = start.getTime();
    endTime(start, 90);
    expect(start.getTime()).toBe(t);
  });

  it("treats negative durations as zero", () => {
    const start = new Date("2026-04-27T10:00:00Z");
    const end = endTime(start, -30);
    expect(end.getTime()).toBe(start.getTime());
  });
});

describe("validateDurationBounds", () => {
  it("returns null for valid input", () => {
    expect(validateDurationBounds({ minMinutes: 15, maxMinutes: 60 })).toBeNull();
    expect(validateDurationBounds({ minMinutes: 0, maxMinutes: 0 })).toBeNull();
  });

  it("rejects min > max", () => {
    expect(validateDurationBounds({ minMinutes: 60, maxMinutes: 15 })).toMatch(
      /Min/
    );
  });

  it("rejects negatives", () => {
    expect(validateDurationBounds({ minMinutes: -1, maxMinutes: 5 })).toMatch(
      /negative/
    );
  });

  it("rejects above 24h", () => {
    expect(
      validateDurationBounds({ minMinutes: 0, maxMinutes: MAX_DURATION_MINUTES + 1 })
    ).toMatch(/24h/);
  });

  it("rejects non-finite values", () => {
    expect(validateDurationBounds({ minMinutes: NaN, maxMinutes: 5 })).toMatch(
      /whole minutes/
    );
    expect(validateDurationBounds({ minMinutes: 5, maxMinutes: Infinity })).toMatch(
      /whole minutes/
    );
  });
});
