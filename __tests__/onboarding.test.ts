/**
 * Unit tests for utils/onboarding.ts
 *
 * Self-contained jest.mock('expo-sqlite') factory backed by an in-memory
 * settings Map, so getSetting/upsertSetting (and therefore isOnboarded /
 * completeOnboarding) round-trip against real db.ts logic without a native
 * SQLite dependency. No react renderer is used or required.
 */

jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

import * as SQLite from "expo-sqlite";
import { getDb, getSetting } from "../db";
import {
  ONBOARDING_STEPS,
  shouldShowOnboarding,
  isOnboarded,
  completeOnboarding,
} from "../utils/onboarding";

// In-memory settings store backing the mocked DB.
let settingsStore: Map<string, string>;

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn(async (sql: string, key?: string, value?: string) => {
    if (typeof sql === "string" && sql.includes("INSERT INTO settings")) {
      settingsStore.set(key as string, value as string);
    }
    return { lastInsertRowId: 1, changes: 1 };
  }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn(async (sql: string, key?: string) => {
    if (typeof sql === "string" && sql.includes("SELECT value FROM settings")) {
      const val = settingsStore.get(key as string);
      return val !== undefined ? { value: val } : null;
    }
    return null;
  }),
};

beforeAll(async () => {
  jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(
    mockDb as unknown as SQLite.SQLiteDatabase
  );
  await getDb();
});

beforeEach(() => {
  settingsStore = new Map();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// shouldShowOnboarding
// ---------------------------------------------------------------------------
describe("shouldShowOnboarding", () => {
  it.each([
    [null, true],
    ["", true],
    ["0", true],
    ["1", false],
  ])("shouldShowOnboarding(%p) -> %p", (input, expected) => {
    expect(shouldShowOnboarding(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Fresh install path
// ---------------------------------------------------------------------------
describe("fresh install", () => {
  it("isOnboarded() resolves false with an empty settings store", async () => {
    await expect(isOnboarded()).resolves.toBe(false);
  });

  it("shouldShowOnboarding(await getSetting('onboarded')) is true", async () => {
    const saved = await getSetting("onboarded");
    expect(shouldShowOnboarding(saved)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// completeOnboarding
// ---------------------------------------------------------------------------
describe("completeOnboarding", () => {
  it("writes onboarded='1' into the settings store", async () => {
    await completeOnboarding();
    expect(settingsStore.get("onboarded")).toBe("1");
  });

  it("subsequent isOnboarded() resolves true and the gate returns false", async () => {
    await completeOnboarding();
    await expect(isOnboarded()).resolves.toBe(true);
    const saved = await getSetting("onboarded");
    expect(shouldShowOnboarding(saved)).toBe(false);
  });

  it("is idempotent — calling twice leaves exactly one settings row with value '1'", async () => {
    await completeOnboarding();
    await completeOnboarding();
    expect(settingsStore.size).toBe(1);
    expect(settingsStore.get("onboarded")).toBe("1");
  });
});

// ---------------------------------------------------------------------------
// ONBOARDING_STEPS shape
// ---------------------------------------------------------------------------
describe("ONBOARDING_STEPS", () => {
  it("has exactly 3 entries", () => {
    expect(ONBOARDING_STEPS).toHaveLength(3);
  });

  it("has unique keys", () => {
    const keys = ONBOARDING_STEPS.map((step) => step.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has non-empty title and body for every step", () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.title.length).toBeGreaterThan(0);
      expect(step.body.length).toBeGreaterThan(0);
    }
  });

  it("mentions permissions in the third step", () => {
    const thirdStep = ONBOARDING_STEPS[2];
    expect(
      thirdStep.title.toLowerCase().includes("permission") ||
        thirdStep.body.toLowerCase().includes("permission")
    ).toBe(true);
  });
});
