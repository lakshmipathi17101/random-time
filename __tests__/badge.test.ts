/**
 * Unit tests for utils/badge.ts (computeBadgeCount) and the
 * setBadgeCount/clearBadge wrappers in notificationService.ts.
 *
 * Self-contained jest.mock('expo-notifications') factory with jest.fn()s —
 * no react renderer, no new dev dependencies. Follows __tests__/notificationService.test.ts
 * conventions.
 */

// Self-contained factory — all jest.fn() created inside to avoid hoisting issues
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  setNotificationCategoryAsync: jest.fn(),
  scheduleNotificationAsync: jest.fn(),
  cancelScheduledNotificationAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
  setBadgeCountAsync: jest.fn(),
  AndroidImportance: { HIGH: 4, MAX: 5 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

import * as Notifications from "expo-notifications";
import { computeBadgeCount } from "../utils/badge";
import { setBadgeCount, clearBadge } from "../notificationService";
import type { Task } from "../db";

const mockSetBadgeCountAsync = jest.mocked(Notifications.setBadgeCountAsync);

beforeEach(() => {
  jest.clearAllMocks();
  mockSetBadgeCountAsync.mockResolvedValue(true);
});

type PartialTask = Pick<Task, "status" | "event_date">;

// ---------------------------------------------------------------------------
// computeBadgeCount
// ---------------------------------------------------------------------------
describe("computeBadgeCount", () => {
  const NOW = new Date("2026-06-15T12:00:00.000Z");

  it("returns 0 for an empty list", () => {
    expect(computeBadgeCount([], NOW)).toBe(0);
  });

  it("counts a pending task scheduled today", () => {
    const tasks: PartialTask[] = [
      { status: "pending", event_date: "2026-06-15T09:00:00.000Z" },
    ];
    expect(computeBadgeCount(tasks, NOW)).toBe(1);
  });

  it("counts a pending task overdue from yesterday", () => {
    const tasks: PartialTask[] = [
      { status: "pending", event_date: "2026-06-14T09:00:00.000Z" },
    ];
    expect(computeBadgeCount(tasks, NOW)).toBe(1);
  });

  it("does not count a pending task scheduled for tomorrow", () => {
    const tasks: PartialTask[] = [
      { status: "pending", event_date: "2026-06-16T09:00:00.000Z" },
    ];
    expect(computeBadgeCount(tasks, NOW)).toBe(0);
  });

  it("does not count a done task scheduled today", () => {
    const tasks: PartialTask[] = [
      { status: "done", event_date: "2026-06-15T09:00:00.000Z" },
    ];
    expect(computeBadgeCount(tasks, NOW)).toBe(0);
  });

  it("returns the correct total for a mixed list", () => {
    const tasks: PartialTask[] = [
      { status: "pending", event_date: "2026-06-15T09:00:00.000Z" }, // today, counted
      { status: "pending", event_date: "2026-06-14T09:00:00.000Z" }, // overdue, counted
      { status: "pending", event_date: "2026-06-16T09:00:00.000Z" }, // future, skipped
      { status: "done", event_date: "2026-06-15T09:00:00.000Z" }, // done, skipped
      { status: "pending", event_date: "2026-06-13T09:00:00.000Z" }, // overdue, counted
    ];
    expect(computeBadgeCount(tasks, NOW)).toBe(3);
  });

  it("skips a task with an empty event_date without throwing", () => {
    const tasks: PartialTask[] = [{ status: "pending", event_date: "" }];
    expect(() => computeBadgeCount(tasks, NOW)).not.toThrow();
    expect(computeBadgeCount(tasks, NOW)).toBe(0);
  });

  it("skips a task with an unparseable event_date without throwing", () => {
    const tasks: PartialTask[] = [{ status: "pending", event_date: "not-a-date" }];
    expect(() => computeBadgeCount(tasks, NOW)).not.toThrow();
    expect(computeBadgeCount(tasks, NOW)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// setBadgeCount
// ---------------------------------------------------------------------------
describe("setBadgeCount", () => {
  it("forwards a non-negative integer to setBadgeCountAsync and returns its result", async () => {
    mockSetBadgeCountAsync.mockResolvedValueOnce(true);
    const result = await setBadgeCount(5);
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(5);
    expect(result).toBe(true);
  });

  it("normalises -1 to 0", async () => {
    await setBadgeCount(-1);
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(0);
  });

  it("normalises 2.7 to 2", async () => {
    await setBadgeCount(2.7);
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(2);
  });

  it("resolves false (not rejects) when setBadgeCountAsync rejects", async () => {
    mockSetBadgeCountAsync.mockRejectedValueOnce(new Error("unsupported"));
    await expect(setBadgeCount(3)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clearBadge
// ---------------------------------------------------------------------------
describe("clearBadge", () => {
  it("calls setBadgeCountAsync(0)", async () => {
    await clearBadge();
    expect(mockSetBadgeCountAsync).toHaveBeenCalledWith(0);
  });
});
