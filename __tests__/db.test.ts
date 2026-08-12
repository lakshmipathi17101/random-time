/**
 * Unit tests for db.ts
 * Tests verify correct SQL queries and params are passed to the DB layer.
 */

// Self-contained factory — no external variables (avoids babel-jest hoisting issues)
jest.mock("expo-sqlite", () => ({
  openDatabaseAsync: jest.fn(),
}));

import * as SQLite from "expo-sqlite";
import {
  getDb,
  insertTask,
  updateTaskStatus,
  updateTask,
  updateTaskTime,
  getTasks,
  deleteTask,
  getDoneTasks,
  getSetting,
  upsertSetting,
} from "../db";

// Mock DB methods — defined at module level so they're accessible in tests
const mockDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 42, changes: 1 }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
};

// Initialize the DB singleton once, then clear call counts before tests start
beforeAll(async () => {
  jest.mocked(SQLite.openDatabaseAsync).mockResolvedValue(
    mockDb as unknown as SQLite.SQLiteDatabase
  );
  await getDb();
  jest.clearAllMocks();
  mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 42, changes: 1 });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 42, changes: 1 });
  mockDb.getAllAsync.mockResolvedValue([]);
  mockDb.getFirstAsync.mockResolvedValue(null);
});

// ---------------------------------------------------------------------------
// insertTask
// ---------------------------------------------------------------------------
describe("insertTask", () => {
  it("returns the lastInsertRowId from DB", async () => {
    mockDb.runAsync.mockResolvedValueOnce({ lastInsertRowId: 99, changes: 1 });
    const id = await insertTask({
      title: "Test Task",
      event_date: "2026-03-01T10:00:00.000Z",
      reminder_minutes: 15,
      alarm_notification_id: null,
      reminder_notification_id: null,
      calendar_event_id: null,
    });
    expect(id).toBe(99);
  });

  it("calls runAsync with INSERT INTO tasks SQL", async () => {
    await insertTask({
      title: "My Task",
      event_date: "2026-03-01T10:00:00.000Z",
      reminder_minutes: 10,
      alarm_notification_id: "alarm-1",
      reminder_notification_id: "reminder-1",
      calendar_event_id: "cal-1",
      notes: "Some notes",
      category: "Work",
      priority: "High",
    });
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    const [sql, ...params] = mockDb.runAsync.mock.calls[0] as [string, ...unknown[]];
    expect(sql).toContain("INSERT INTO tasks");
    expect(params).toContain("My Task");
    expect(params).toContain("Work");
    expect(params).toContain("High");
    expect(params).toContain("Some notes");
    expect(params).toContain("alarm-1");
    expect(params).toContain("cal-1");
  });

  it("inserts with 'pending' status by default", async () => {
    await insertTask({
      title: "Task",
      event_date: "2026-03-01T10:00:00.000Z",
      reminder_minutes: 0,
      alarm_notification_id: null,
      reminder_notification_id: null,
      calendar_event_id: null,
    });
    const [sql] = mockDb.runAsync.mock.calls[0] as [string];
    expect(sql).toContain("'pending'");
  });

  it("passes null for unspecified optional fields", async () => {
    await insertTask({
      title: "Minimal",
      event_date: "2026-03-01T10:00:00.000Z",
      reminder_minutes: 0,
      alarm_notification_id: null,
      reminder_notification_id: null,
      calendar_event_id: null,
    });
    // params order: title, event_date, reminder_minutes, alarm_id, reminder_id,
    //               reminder_ids, calendar_id, created_at, notes, category, priority
    const params = mockDb.runAsync.mock.calls[0].slice(1) as unknown[];
    // notes (index 8), category (index 9), priority (index 10) should be null
    expect(params[8]).toBeNull();
    expect(params[9]).toBeNull();
    expect(params[10]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// updateTaskStatus
// ---------------------------------------------------------------------------
describe("updateTaskStatus", () => {
  it("calls UPDATE tasks SET status = 'done'", async () => {
    await updateTaskStatus(5, "done");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tasks SET status"),
      "done",
      5
    );
  });

  it("calls UPDATE tasks SET status = 'pending'", async () => {
    await updateTaskStatus(3, "pending");
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE tasks SET status"),
      "pending",
      3
    );
  });
});

// ---------------------------------------------------------------------------
// updateTask
// ---------------------------------------------------------------------------
describe("updateTask", () => {
  it("calls runAsync with all updated fields", async () => {
    await updateTask(7, {
      title: "Updated Title",
      event_date: "2026-04-01T12:00:00.000Z",
      reminder_minutes: 30,
      notes: "New notes",
      alarm_notification_id: "a1",
      reminder_notification_id: "r1",
      reminder_notification_ids: '["r1","r2"]',
      category: "Personal",
      priority: "Low",
    });
    expect(mockDb.runAsync).toHaveBeenCalledTimes(1);
    const [sql, ...params] = mockDb.runAsync.mock.calls[0] as [string, ...unknown[]];
    expect(sql).toContain("UPDATE tasks");
    expect(params).toContain("Updated Title");
    expect(params).toContain("Personal");
    expect(params).toContain("Low");
    expect(params).toContain("New notes");
    expect(params).toContain(7); // WHERE id = ?
  });

  it("passes null for omitted optional fields", async () => {
    await updateTask(1, {
      title: "T",
      event_date: "2026-04-01T12:00:00.000Z",
      reminder_minutes: 0,
      notes: null,
      alarm_notification_id: null,
      reminder_notification_id: null,
    });
    // reminder_notification_ids (index 6), category (index 7), priority (index 8)
    const params = mockDb.runAsync.mock.calls[0].slice(1) as unknown[];
    expect(params[6]).toBeNull(); // reminder_notification_ids
    expect(params[7]).toBeNull(); // category
    expect(params[8]).toBeNull(); // priority
  });
});

// ---------------------------------------------------------------------------
// updateTaskTime
// ---------------------------------------------------------------------------
describe("updateTaskTime", () => {
  it("resets status to 'pending'", async () => {
    await updateTaskTime(2, "2026-05-01T08:00:00.000Z", "new-alarm", "new-reminder");
    const [sql] = mockDb.runAsync.mock.calls[0] as [string];
    expect(sql).toContain("status = 'pending'");
  });

  it("passes all five parameters in correct order", async () => {
    await updateTaskTime(10, "2026-05-01T08:00:00.000Z", "alarm-x", "reminder-x", '["r1","r2"]');
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("event_date"),
      "2026-05-01T08:00:00.000Z",
      "alarm-x",
      "reminder-x",
      '["r1","r2"]',
      10
    );
  });

  it("accepts null notification IDs", async () => {
    await updateTaskTime(4, "2026-05-01T08:00:00.000Z", null, null, null);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.any(String),
      "2026-05-01T08:00:00.000Z",
      null,
      null,
      null,
      4
    );
  });

  it("defaults reminder_notification_ids to null when omitted", async () => {
    await updateTaskTime(7, "2026-05-01T08:00:00.000Z", "a1", "r1");
    const params = mockDb.runAsync.mock.calls[0].slice(1) as unknown[];
    // params: event_date, alarm_id, reminder_id, reminder_ids, id
    expect(params[3]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getTasks
// ---------------------------------------------------------------------------
describe("getTasks", () => {
  it("returns the tasks array from DB", async () => {
    const fixture = [
      { id: 1, title: "A", status: "pending" },
      { id: 2, title: "B", status: "done" },
    ];
    mockDb.getAllAsync.mockResolvedValueOnce(fixture);
    const tasks = await getTasks();
    expect(tasks).toEqual(fixture);
  });

  it("orders results by event_date ASC", async () => {
    await getTasks();
    const [sql] = mockDb.getAllAsync.mock.calls[0] as [string];
    expect(sql).toContain("ORDER BY event_date ASC");
  });

  it("returns empty array when no tasks exist", async () => {
    const tasks = await getTasks();
    expect(tasks).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// deleteTask
// ---------------------------------------------------------------------------
describe("deleteTask", () => {
  it("calls DELETE FROM tasks WHERE id with correct ID", async () => {
    await deleteTask(42);
    expect(mockDb.runAsync).toHaveBeenCalledWith(
      expect.stringContaining("DELETE FROM tasks"),
      42
    );
  });

  it("uses the exact task ID passed", async () => {
    await deleteTask(17);
    const [, id] = mockDb.runAsync.mock.calls[0] as [string, number];
    expect(id).toBe(17);
  });
});

// ---------------------------------------------------------------------------
// getDoneTasks
// ---------------------------------------------------------------------------
describe("getDoneTasks", () => {
  it("filters only done tasks in SQL", async () => {
    await getDoneTasks();
    const [sql] = mockDb.getAllAsync.mock.calls[0] as [string];
    expect(sql).toContain("status = 'done'");
  });

  it("returns the done tasks array", async () => {
    const done = [{ id: 3, status: "done", title: "Finished" }];
    mockDb.getAllAsync.mockResolvedValueOnce(done);
    const result = await getDoneTasks();
    expect(result).toEqual(done);
  });
});

// ---------------------------------------------------------------------------
// getSetting
// ---------------------------------------------------------------------------
describe("getSetting", () => {
  it("returns the value string when setting exists", async () => {
    mockDb.getFirstAsync.mockResolvedValueOnce({ value: "1" });
    const val = await getSetting("is24h");
    expect(val).toBe("1");
  });

  it("returns null when setting does not exist", async () => {
    const val = await getSetting("min_h");
    expect(val).toBeNull();
  });

  it("queries settings table with the given key", async () => {
    await getSetting("max_h");
    expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
      expect.stringContaining("SELECT value FROM settings WHERE key"),
      "max_h"
    );
  });
});

// ---------------------------------------------------------------------------
// upsertSetting
// ---------------------------------------------------------------------------
describe("upsertSetting", () => {
  it("calls INSERT ... ON CONFLICT upsert", async () => {
    await upsertSetting("is24h", "0");
    const [sql, key, value] = mockDb.runAsync.mock.calls[0] as [string, string, string];
    expect(sql).toContain("INSERT INTO settings");
    expect(sql).toContain("ON CONFLICT");
    expect(key).toBe("is24h");
    expect(value).toBe("0");
  });

  it("works for all SettingKey values", async () => {
    const keys = [
      "is24h",
      "min_h",
      "min_m",
      "min_s",
      "max_h",
      "max_m",
      "max_s",
      "default_reminder",
    ] as const;
    for (const key of keys) {
      jest.clearAllMocks();
      mockDb.runAsync.mockResolvedValue({ lastInsertRowId: 1, changes: 1 });
      await upsertSetting(key, "5");
      const [, k] = mockDb.runAsync.mock.calls[0] as [string, string];
      expect(k).toBe(key);
    }
  });
});

// ---------------------------------------------------------------------------
// Migration error handling
// ---------------------------------------------------------------------------
/**
 * Load a fresh copy of db.ts (with its module-level `_db` / `_dbInit` singleton
 * state reset) on top of a caller-supplied expo-sqlite mock.
 *
 * `jest.isolateModules` does NOT re-execute the module under this preset — the
 * require inside it returns the already-initialized instance, so any test built
 * on it silently asserts nothing about initialization. `jest.resetModules()`
 * plus `jest.doMock` (which, unlike `jest.mock`, is not hoisted) does give a
 * genuinely fresh module.
 */
const loadFreshDb = (
  openDatabaseAsync: jest.Mock
): typeof import("../db") => {
  jest.resetModules();
  jest.doMock("expo-sqlite", () => ({ openDatabaseAsync }));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../db") as typeof import("../db");
};

/** A minimal SQLiteDatabase stand-in that satisfies openAndMigrate(). */
const makeMockDb = () => ({
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 1, changes: 1 }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
});

describe("getDb migrations", () => {
  afterEach(() => {
    jest.dontMock("expo-sqlite");
    jest.resetModules();
  });

  it("silently swallows duplicate column errors during init", async () => {
    const mockOpen = jest.fn().mockResolvedValue({
      ...makeMockDb(),
      execAsync: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes("ADD COLUMN")) {
          throw new Error("table tasks already has column status");
        }
      }),
    });

    // Should resolve without throwing
    await expect(loadFreshDb(mockOpen).getDb()).resolves.toBeDefined();
    expect(mockOpen).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// getDb initialization caching (concurrent callers + retry after failure)
// ---------------------------------------------------------------------------
describe("getDb initialization", () => {
  afterEach(() => {
    jest.dontMock("expo-sqlite");
    jest.resetModules();
  });

  it("opens the database exactly once when getDb() is called concurrently", async () => {
    // Several call sites (App init, loadTasks, settings effects, dashboard) all
    // call getDb() on mount. Without the cached in-flight promise each would see
    // _db === null and re-run open + CREATE TABLE + every migration in parallel.
    const mockOpen = jest.fn().mockResolvedValue(makeMockDb());
    const freshDb = loadFreshDb(mockOpen);

    const [a, b, c] = await Promise.all([
      freshDb.getDb(),
      freshDb.getDb(),
      freshDb.getDb(),
    ]);

    expect(mockOpen).toHaveBeenCalledTimes(1);
    // All concurrent callers get the same instance.
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("retries on a later call when the first initialization fails", async () => {
    // A rejected init must not stay cached — otherwise every later getDb() call
    // for the lifetime of the process reuses the same rejected promise and the
    // app is permanently stuck with no database.
    const mockFlakyOpen = jest
      .fn()
      .mockRejectedValueOnce(new Error("disk I/O error"))
      .mockResolvedValue(makeMockDb());
    const freshDb = loadFreshDb(mockFlakyOpen);

    await expect(freshDb.getDb()).rejects.toThrow("disk I/O error");

    // The cache was cleared, so this call actually re-opens the database.
    await expect(freshDb.getDb()).resolves.toBeDefined();
    expect(mockFlakyOpen).toHaveBeenCalledTimes(2);
  });
});
