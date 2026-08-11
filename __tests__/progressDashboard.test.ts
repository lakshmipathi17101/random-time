/**
 * Integration-style tests for the progress dashboard DB functions.
 * Uses a stateful in-memory mock of expo-sqlite so the full
 * upsertCompletion / getCompletions / purgeOldCompletions flow can be
 * exercised without a native SQLite binary.
 */

// Self-contained factory — no external variables (avoids babel-jest hoisting issues)
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

import * as SQLite from "expo-sqlite";
import {
  upsertCompletion,
  getCompletions,
  purgeOldCompletions,
  getDb,
} from "../db";

// ---------------------------------------------------------------------------
// In-memory store that backs the mock DB
// ---------------------------------------------------------------------------

interface CompletionRow {
  task_id: number;
  date: string;
  done: number;
}

// Shared mutable store reset in beforeEach so each test starts clean
let completionsStore: Map<string, CompletionRow> = new Map();

// ---------------------------------------------------------------------------
// Stateful mock DB
// Implements UPSERT, ranged SELECT, and date-filtered DELETE for
// task_completions only; all other SQL is a no-op.
// ---------------------------------------------------------------------------

const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),

  runAsync: jest.fn().mockImplementation(async (sql: string, ...params: unknown[]) => {
    if (sql.includes("INSERT INTO task_completions")) {
      // INSERT ... ON CONFLICT(task_id, date) DO UPDATE SET done = excluded.done
      const taskId = params[0] as number;
      const date = params[1] as string;
      const done = params[2] as number;
      completionsStore.set(`${taskId}-${date}`, { task_id: taskId, date, done });
    } else if (sql.includes("DELETE FROM task_completions")) {
      // DELETE WHERE date < cutoff
      const cutoff = params[0] as string;
      for (const [key, row] of completionsStore.entries()) {
        if (row.date < cutoff) {
          completionsStore.delete(key);
        }
      }
    }
    return { lastInsertRowId: 1, changes: 1 };
  }),

  getAllAsync: jest.fn().mockImplementation(async (sql: string, ...params: unknown[]) => {
    if (sql.includes("FROM task_completions")) {
      // SELECT ... WHERE date BETWEEN ? AND ?
      const startDate = params[0] as string;
      const endDate = params[1] as string;
      return Array.from(completionsStore.values())
        .filter((row) => row.date >= startDate && row.date <= endDate)
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return [];
  }),

  getFirstAsync: jest.fn().mockResolvedValue(null),
};

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

beforeAll(async () => {
  jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(
    mockDb as unknown as SQLite.SQLiteDatabase
  );
  // Initialise the db singleton once; subsequent calls return the cached instance
  await getDb();
});

beforeEach(() => {
  // Reset the in-memory store before each test so tests are independent.
  // Do NOT call jest.clearAllMocks() here — that would wipe the mockImplementations
  // above and break the stateful behaviour.
  completionsStore = new Map();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function daysOffset(n: number): string {
  return new Date(Date.now() + n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("upsertCompletion + getCompletions", () => {
  it("inserts a row and getCompletions returns it for the matching date range", async () => {
    const date = daysOffset(0); // today
    await upsertCompletion(1, date, true);

    const results = await getCompletions(date, date);

    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ taskId: 1, date, done: true });
  });

  it("row is NOT returned when it falls outside the requested date range", async () => {
    const yesterday = daysOffset(-1);
    const today = daysOffset(0);

    await upsertCompletion(2, yesterday, true);

    // Query only for today — yesterday's row must not appear
    const results = await getCompletions(today, today);
    expect(results).toHaveLength(0);
  });
});

describe("upsertCompletion idempotency (same task + date)", () => {
  it("calling upsertCompletion twice on the same task+date updates the row instead of duplicating it", async () => {
    const date = daysOffset(0);

    await upsertCompletion(10, date, false);
    await upsertCompletion(10, date, true); // second call flips done to true

    const results = await getCompletions(date, date);

    expect(results).toHaveLength(1); // still exactly ONE row
    expect(results[0].done).toBe(true); // value was updated
  });
});

describe("purgeOldCompletions", () => {
  it("removes a row dated 366+ days ago and leaves a row dated today", async () => {
    const today = daysOffset(0);
    const old = daysOffset(-366); // 366 days before today — older than the 365-day cutoff

    await upsertCompletion(20, old, true);
    await upsertCompletion(21, today, true);

    await purgeOldCompletions();

    // Only today's row must survive
    const remaining = await getCompletions(old, today);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].date).toBe(today);
  });

  it("does not remove a row that is exactly on the cutoff boundary (365 days ago)", async () => {
    // cutoff = today - 365 days; the DELETE removes rows strictly < cutoff
    const cutoff = daysOffset(-365);

    await upsertCompletion(30, cutoff, true);

    await purgeOldCompletions();

    const remaining = await getCompletions(cutoff, cutoff);
    // The boundary row is NOT strictly less than the cutoff, so it stays
    expect(remaining).toHaveLength(1);
  });
});

describe("getCompletions edge cases", () => {
  it("returns an empty array when startDate is after endDate", async () => {
    // Insert a row so there is data in the store
    const today = daysOffset(0);
    await upsertCompletion(40, today, true);

    // Ask for a range where start > end — SQL BETWEEN returns nothing
    const results = await getCompletions(today, daysOffset(-1));

    expect(results).toEqual([]);
  });

  it("returns an empty array when the store is empty", async () => {
    const today = daysOffset(0);
    const results = await getCompletions(today, today);
    expect(results).toEqual([]);
  });
});
