/**
 * Unit tests for notificationService.ts
 * Mocks expo-notifications with self-contained jest.fn() factories.
 */

// ---------------------------------------------------------------------------
// Phase 12 — Mock overlayAlarmBridge before importing notificationService so
// that the module-level side effects (setNotificationHandler) see the mock.
//
// jest.mock() factories are hoisted and cannot reference out-of-scope
// variables. Variables prefixed with "mock" (case-insensitive) are allowed.
// We declare mockOverlayListeners at module scope so both the factory and
// the __emitOverlayAlarmAction helper can share it.
// ---------------------------------------------------------------------------

// eslint-disable-next-line prefer-const
let mockOverlayListeners: Array<(p: { taskId: string; action: string }) => void> = [];

jest.mock("../overlayAlarmBridge", () => {
  const mockFireOverlayAlarm = jest.fn().mockResolvedValue({ fired: "overlay" });
  const mockDismissOverlayAlarm = jest.fn().mockResolvedValue(undefined);
  const mockScheduleOverlayAlarm = jest.fn().mockResolvedValue({ scheduled: "overlay" });
  const mockCancelOverlayAlarm = jest.fn().mockResolvedValue(undefined);
  const mockOnAlarmAction = jest.fn().mockImplementation((listener) => {
    mockOverlayListeners.push(listener);
    return () => {
      const idx = mockOverlayListeners.indexOf(listener);
      if (idx !== -1) mockOverlayListeners.splice(idx, 1);
    };
  });

  return {
    __esModule: true,
    default: {
      fireOverlayAlarm: mockFireOverlayAlarm,
      dismissOverlayAlarm: mockDismissOverlayAlarm,
      scheduleOverlayAlarm: mockScheduleOverlayAlarm,
      cancelOverlayAlarm: mockCancelOverlayAlarm,
      onAlarmAction: mockOnAlarmAction,
    },
    // Test-only helper — matches the real overlayAlarmBridge.__emitOverlayAlarmAction API.
    __emitOverlayAlarmAction: (payload: { taskId: string; action: string }) => {
      mockOverlayListeners.forEach((l) => l(payload));
    },
  };
});

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
  AndroidImportance: { HIGH: 4, MAX: 5 },
  SchedulableTriggerInputTypes: { DATE: "date" },
}));

// jest-expo already mocks react-native — rely on its Platform.OS default (ios)

import * as Notifications from "expo-notifications";
import overlayAlarmBridge, { __emitOverlayAlarmAction } from "../overlayAlarmBridge";
import {
  requestNotificationPermission,
  setupNotificationResponseHandler,
  scheduleReminder,
  scheduleAlarm,
  cancelNotification,
  scheduleGentleNudge,
  fireOverlayAlarmNow,
  setupOverlayAlarmResponseHandler,
} from "../notificationService";

// Typed references to the mock functions
const mockGetPermissions = jest.mocked(Notifications.getPermissionsAsync);
const mockRequestPermissions = jest.mocked(Notifications.requestPermissionsAsync);
const mockSetChannel = jest.mocked(Notifications.setNotificationChannelAsync);
const mockSetCategory = jest.mocked(Notifications.setNotificationCategoryAsync);
const mockSchedule = jest.mocked(Notifications.scheduleNotificationAsync);
const mockCancel = jest.mocked(Notifications.cancelScheduledNotificationAsync);
const mockAddListener = jest.mocked(
  Notifications.addNotificationResponseReceivedListener
);
// Phase 12 — typed reference to the overlay bridge schedule mock
const mockScheduleOverlayAlarm = jest.mocked(overlayAlarmBridge.scheduleOverlayAlarm);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPermissions.mockResolvedValue({ status: "granted" } as Awaited<
    ReturnType<typeof Notifications.getPermissionsAsync>
  >);
  mockRequestPermissions.mockResolvedValue({ status: "granted" } as Awaited<
    ReturnType<typeof Notifications.requestPermissionsAsync>
  >);
  mockSetChannel.mockResolvedValue(null as never);
  mockSetCategory.mockResolvedValue(null as never);
  mockSchedule.mockResolvedValue("notif-id-123");
  mockCancel.mockResolvedValue(undefined);
  mockAddListener.mockReturnValue({
    remove: jest.fn(),
  } as unknown as ReturnType<typeof Notifications.addNotificationResponseReceivedListener>);
  // Default: bridge scheduleOverlayAlarm succeeds with 'overlay'
  mockScheduleOverlayAlarm.mockResolvedValue({ scheduled: "overlay" });
});

// ---------------------------------------------------------------------------
// requestNotificationPermission
// ---------------------------------------------------------------------------
describe("requestNotificationPermission", () => {
  it("returns true when permission is already granted", async () => {
    const result = await requestNotificationPermission();
    expect(result).toBe(true);
    expect(mockRequestPermissions).not.toHaveBeenCalled();
  });

  it("requests permission when not yet granted and returns true on grant", async () => {
    mockGetPermissions.mockResolvedValueOnce({ status: "undetermined" } as never);
    mockRequestPermissions.mockResolvedValueOnce({ status: "granted" } as never);
    const result = await requestNotificationPermission();
    expect(result).toBe(true);
    expect(mockRequestPermissions).toHaveBeenCalledTimes(1);
  });

  it("returns false when user denies permission", async () => {
    mockGetPermissions.mockResolvedValueOnce({ status: "undetermined" } as never);
    mockRequestPermissions.mockResolvedValueOnce({ status: "denied" } as never);
    const result = await requestNotificationPermission();
    expect(result).toBe(false);
  });

  it("registers task_alarm notification category with Done and Postpone actions", async () => {
    mockGetPermissions.mockResolvedValueOnce({ status: "undetermined" } as never);
    await requestNotificationPermission();
    expect(mockSetCategory).toHaveBeenCalledWith(
      "task_alarm",
      expect.arrayContaining([
        expect.objectContaining({ identifier: "done" }),
        expect.objectContaining({ identifier: "postpone" }),
      ])
    );
  });
});

// ---------------------------------------------------------------------------
// scheduleReminder
// ---------------------------------------------------------------------------
describe("scheduleReminder", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns null when trigger time is in the past", async () => {
    // Event in 1h, reminder 90 min before → trigger 30 min ago
    const eventDate = new Date("2026-03-01T13:00:00.000Z");
    const id = await scheduleReminder("Test", eventDate, 90);
    expect(id).toBeNull();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("returns null when trigger equals current time", async () => {
    // Event in 15 min, reminder 15 min before → trigger = now
    const eventDate = new Date("2026-03-01T12:15:00.000Z");
    const id = await scheduleReminder("Test", eventDate, 15);
    expect(id).toBeNull();
  });

  it("returns notification ID when trigger is in the future", async () => {
    // Event in 2h, reminder 30 min before → trigger 90 min from now
    const eventDate = new Date("2026-03-01T14:00:00.000Z");
    const id = await scheduleReminder("My Event", eventDate, 30);
    expect(id).toBe("notif-id-123");
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it("includes task title and minutesBefore in the notification body", async () => {
    const eventDate = new Date("2026-03-01T14:00:00.000Z");
    await scheduleReminder("Sprint Review", eventDate, 10);
    const [payload] = mockSchedule.mock.calls[0] as [{ content: { body: string } }];
    expect(payload.content.body).toContain("Sprint Review");
    expect(payload.content.body).toContain("10");
  });

  it("uses DATE trigger type", async () => {
    const eventDate = new Date("2026-03-01T14:00:00.000Z");
    await scheduleReminder("Test", eventDate, 5);
    const [payload] = mockSchedule.mock.calls[0] as [
      { trigger: { type: string } }
    ];
    expect(payload.trigger.type).toBe("date");
  });
});

// ---------------------------------------------------------------------------
// scheduleAlarm
// ---------------------------------------------------------------------------
describe("scheduleAlarm", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("returns null when eventDate is in the past", async () => {
    const pastDate = new Date("2026-03-01T11:59:00.000Z");
    const id = await scheduleAlarm("Test", pastDate);
    expect(id).toBeNull();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("returns notification ID for a future event", async () => {
    const futureDate = new Date("2026-03-01T13:00:00.000Z");
    const id = await scheduleAlarm("Meeting", futureDate);
    expect(id).toBe("notif-id-123");
    expect(mockSchedule).toHaveBeenCalledTimes(1);
  });

  it("sets categoryIdentifier to 'task_alarm'", async () => {
    const futureDate = new Date("2026-03-01T13:00:00.000Z");
    await scheduleAlarm("Meeting", futureDate);
    const [payload] = mockSchedule.mock.calls[0] as [
      { content: { categoryIdentifier: string } }
    ];
    expect(payload.content.categoryIdentifier).toBe("task_alarm");
  });

  it("embeds taskId in notification data when provided", async () => {
    const futureDate = new Date("2026-03-01T13:00:00.000Z");
    await scheduleAlarm("Meeting", futureDate, 42);
    const [payload] = mockSchedule.mock.calls[0] as unknown as [
      { content: { data: { taskId: number } } }
    ];
    expect(payload.content.data.taskId).toBe(42);
  });

  it("uses empty data object when taskId is omitted", async () => {
    const futureDate = new Date("2026-03-01T13:00:00.000Z");
    await scheduleAlarm("Meeting", futureDate);
    const [payload] = mockSchedule.mock.calls[0] as unknown as [
      { content: { data: Record<string, unknown> } }
    ];
    expect(payload.content.data).toEqual({});
  });

  it("includes task title in the notification body", async () => {
    const futureDate = new Date("2026-03-01T13:00:00.000Z");
    await scheduleAlarm("Doctor Appointment", futureDate);
    const [payload] = mockSchedule.mock.calls[0] as [{ content: { body: string } }];
    expect(payload.content.body).toContain("Doctor Appointment");
  });
});

// ---------------------------------------------------------------------------
// cancelNotification
// ---------------------------------------------------------------------------
describe("cancelNotification", () => {
  it("calls cancelScheduledNotificationAsync with the given ID", async () => {
    await cancelNotification("abc-123");
    expect(mockCancel).toHaveBeenCalledWith("abc-123");
  });

  it("passes the ID through unchanged", async () => {
    await cancelNotification("some-uuid-value");
    expect(mockCancel).toHaveBeenCalledWith("some-uuid-value");
  });
});

// ---------------------------------------------------------------------------
// setupNotificationResponseHandler
// ---------------------------------------------------------------------------
describe("setupNotificationResponseHandler", () => {
  // Build a synthetic notification response object
  const makeResponse = (actionId: string, taskId: number | undefined) => ({
    actionIdentifier: actionId,
    notification: {
      request: {
        content: {
          data: taskId != null ? { taskId } : {},
        },
      },
    },
  });

  // Extract the listener callback registered by setupNotificationResponseHandler
  function getRegisteredListener() {
    return mockAddListener.mock.calls[0][0] as (r: unknown) => void;
  }

  it("returns a cleanup function", () => {
    const cleanup = setupNotificationResponseHandler(jest.fn(), jest.fn());
    expect(typeof cleanup).toBe("function");
  });

  it("routes 'done' action to onDone with the taskId", () => {
    const onDone = jest.fn();
    const onPostpone = jest.fn();
    setupNotificationResponseHandler(onDone, onPostpone);

    getRegisteredListener()(makeResponse("done", 7));

    expect(onDone).toHaveBeenCalledWith(7);
    expect(onPostpone).not.toHaveBeenCalled();
  });

  it("routes 'postpone' action to onPostpone with the taskId", () => {
    const onDone = jest.fn();
    const onPostpone = jest.fn();
    setupNotificationResponseHandler(onDone, onPostpone);

    getRegisteredListener()(makeResponse("postpone", 15));

    expect(onPostpone).toHaveBeenCalledWith(15);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("ignores responses without a taskId", () => {
    const onDone = jest.fn();
    const onPostpone = jest.fn();
    setupNotificationResponseHandler(onDone, onPostpone);

    getRegisteredListener()(makeResponse("done", undefined));

    expect(onDone).not.toHaveBeenCalled();
    expect(onPostpone).not.toHaveBeenCalled();
  });

  it("ignores unknown action identifiers", () => {
    const onDone = jest.fn();
    const onPostpone = jest.fn();
    setupNotificationResponseHandler(onDone, onPostpone);

    getRegisteredListener()(makeResponse("some_other_action", 5));

    expect(onDone).not.toHaveBeenCalled();
    expect(onPostpone).not.toHaveBeenCalled();
  });

  it("cleanup function calls subscription.remove()", () => {
    const removeMock = jest.fn();
    mockAddListener.mockReturnValueOnce({
      remove: removeMock,
    } as unknown as ReturnType<typeof Notifications.addNotificationResponseReceivedListener>);

    const cleanup = setupNotificationResponseHandler(jest.fn(), jest.fn());
    cleanup();

    expect(removeMock).toHaveBeenCalledTimes(1);
  });

  // ──────────────────────────────────────────────────────────────────────
  // Phase 10 — object-form handlers + 'reroll' action
  // ──────────────────────────────────────────────────────────────────────
  it("accepts the object-form handlers (done/postpone/reroll)", () => {
    const onDone = jest.fn();
    const onPostpone = jest.fn();
    const onReroll = jest.fn();
    setupNotificationResponseHandler({ onDone, onPostpone, onReroll });

    getRegisteredListener()(makeResponse("reroll", 42));
    expect(onReroll).toHaveBeenCalledWith(42);
    expect(onDone).not.toHaveBeenCalled();
    expect(onPostpone).not.toHaveBeenCalled();
  });

  it("routes 'reroll' only when onReroll is provided (legacy form ignores it)", () => {
    const onDone = jest.fn();
    const onPostpone = jest.fn();
    // Legacy two-arg form — no onReroll.
    setupNotificationResponseHandler(onDone, onPostpone);

    getRegisteredListener()(makeResponse("reroll", 9));
    expect(onDone).not.toHaveBeenCalled();
    expect(onPostpone).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// scheduleGentleNudge (Phase 10)
// ---------------------------------------------------------------------------
describe("scheduleGentleNudge", () => {
  it("returns null when the trigger time is in the past", async () => {
    const pastEvent = new Date(Date.now() - 60 * 60 * 1000);
    const result = await scheduleGentleNudge("Meeting", pastEvent, 5);
    expect(result).toBeNull();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("returns a notification ID for a future event", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const result = await scheduleGentleNudge("Deep work", future, 5);
    expect(typeof result).toBe("string");
  });

  it("fires silent (no sound) to avoid being a jump-scare", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await scheduleGentleNudge("Task", future, 5);
    const payload = mockSchedule.mock.calls[mockSchedule.mock.calls.length - 1][0];
    // Explicitly falsy — either `false` or `null`.
    expect(payload.content.sound).toBeFalsy();
  });

  it("defaults minutesBefore to 5 when not specified", async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    mockSchedule.mockClear();
    await scheduleGentleNudge("Task", future);
    const payload = mockSchedule.mock.calls[0][0];
    // "coming up in 5 minutes" should appear in the body
    expect(payload.content.body).toContain("5 minutes");
  });
});

// ---------------------------------------------------------------------------
// Phase 12 — fireOverlayAlarmNow
// ---------------------------------------------------------------------------
describe("fireOverlayAlarmNow", () => {
  const mockFireOverlayAlarm = jest.mocked(overlayAlarmBridge.fireOverlayAlarm);

  beforeEach(() => {
    jest.clearAllMocks();
    // Default: bridge is available and succeeds.
    mockFireOverlayAlarm.mockResolvedValue({ fired: "overlay" });
  });

  it("calls overlayAlarmBridge.fireOverlayAlarm with the given taskId and title", async () => {
    await fireOverlayAlarmNow("task-42", "My Important Task");
    expect(mockFireOverlayAlarm).toHaveBeenCalledTimes(1);
    expect(mockFireOverlayAlarm).toHaveBeenCalledWith("task-42", "My Important Task");
  });

  it("is a no-op (does not throw) when bridge returns 'unavailable'", async () => {
    mockFireOverlayAlarm.mockResolvedValueOnce({ fired: "unavailable" });
    await expect(fireOverlayAlarmNow("task-1", "Some Task")).resolves.toBeUndefined();
  });

  it("is a no-op (does not throw) when bridge returns 'permission_denied'", async () => {
    mockFireOverlayAlarm.mockResolvedValueOnce({ fired: "permission_denied" });
    await expect(fireOverlayAlarmNow("task-2", "Another Task")).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Phase 12 — setupOverlayAlarmResponseHandler
// ---------------------------------------------------------------------------
describe("setupOverlayAlarmResponseHandler", () => {
  // __emitOverlayAlarmAction is provided by the jest.mock factory above.
  // It fires the payload through all active onAlarmAction subscriptions.

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes 'done' payload to onDone handler with the correct taskId", () => {
    const onDone = jest.fn();
    const onPostpone = jest.fn();
    const onReroll = jest.fn();

    setupOverlayAlarmResponseHandler({ onDone, onPostpone, onReroll });
    __emitOverlayAlarmAction({ taskId: "task-done", action: "done" });

    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledWith("task-done");
    expect(onPostpone).not.toHaveBeenCalled();
    expect(onReroll).not.toHaveBeenCalled();
  });

  it("routes 'reroll' payload to onReroll handler with the correct taskId", () => {
    const onDone = jest.fn();
    const onPostpone = jest.fn();
    const onReroll = jest.fn();

    setupOverlayAlarmResponseHandler({ onDone, onPostpone, onReroll });
    __emitOverlayAlarmAction({ taskId: "task-reroll", action: "reroll" });

    expect(onReroll).toHaveBeenCalledTimes(1);
    expect(onReroll).toHaveBeenCalledWith("task-reroll");
    expect(onDone).not.toHaveBeenCalled();
    expect(onPostpone).not.toHaveBeenCalled();
  });

  it("routes 'postpone' payload to onPostpone handler with the correct taskId", () => {
    const onDone = jest.fn();
    const onPostpone = jest.fn();
    const onReroll = jest.fn();

    setupOverlayAlarmResponseHandler({ onDone, onPostpone, onReroll });
    __emitOverlayAlarmAction({ taskId: "task-postpone", action: "postpone" });

    expect(onPostpone).toHaveBeenCalledTimes(1);
    expect(onPostpone).toHaveBeenCalledWith("task-postpone");
    expect(onDone).not.toHaveBeenCalled();
    expect(onReroll).not.toHaveBeenCalled();
  });

  it("returns a cleanup fn that stops event delivery", () => {
    const onDone = jest.fn();
    const onPostpone = jest.fn();
    const onReroll = jest.fn();

    const cleanup = setupOverlayAlarmResponseHandler({ onDone, onPostpone, onReroll });

    // Confirm subscription works before cleanup.
    __emitOverlayAlarmAction({ taskId: "before-unsub", action: "done" });
    expect(onDone).toHaveBeenCalledTimes(1);

    // Unsubscribe — no more events should be delivered.
    cleanup();
    jest.clearAllMocks();

    __emitOverlayAlarmAction({ taskId: "after-unsub", action: "done" });
    expect(onDone).not.toHaveBeenCalled();
    expect(onPostpone).not.toHaveBeenCalled();
    expect(onReroll).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Phase 12 — scheduleAlarm + overlay bridge integration
// ---------------------------------------------------------------------------
describe("scheduleAlarm — overlay bridge integration", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-03-01T12:00:00.000Z"));
    mockSchedule.mockResolvedValue("notif-id-456");
    mockScheduleOverlayAlarm.mockResolvedValue({ scheduled: "overlay" });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("calls both scheduleNotificationAsync AND scheduleOverlayAlarm when taskId is provided and bridge available", async () => {
    const futureDate = new Date("2026-03-01T13:00:00.000Z");
    const id = await scheduleAlarm("Focus block", futureDate, 99);

    // expo-notifications must still be called (fallback always fires)
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    // bridge path must also be called
    expect(mockScheduleOverlayAlarm).toHaveBeenCalledTimes(1);
    expect(mockScheduleOverlayAlarm).toHaveBeenCalledWith(
      "99",
      "Focus block",
      futureDate.getTime()
    );
    // Return value is the expo-notifications id
    expect(id).toBe("notif-id-456");
  });

  it("only calls scheduleNotificationAsync (no bridge call) when taskId is omitted", async () => {
    const futureDate = new Date("2026-03-01T13:00:00.000Z");
    await scheduleAlarm("No-id task", futureDate);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockScheduleOverlayAlarm).not.toHaveBeenCalled();
  });

  it("still resolves (fallback works) when bridge returns permission_denied", async () => {
    mockScheduleOverlayAlarm.mockResolvedValueOnce({ scheduled: "permission_denied" });
    const futureDate = new Date("2026-03-01T13:00:00.000Z");

    const id = await scheduleAlarm("Task A", futureDate, 7);

    // Both calls happened; expo-notifications id is returned
    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockScheduleOverlayAlarm).toHaveBeenCalledTimes(1);
    expect(id).toBe("notif-id-456");
  });

  it("still resolves when bridge returns unavailable", async () => {
    mockScheduleOverlayAlarm.mockResolvedValueOnce({ scheduled: "unavailable" });
    const futureDate = new Date("2026-03-01T13:00:00.000Z");

    const id = await scheduleAlarm("Task B", futureDate, 5);

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(id).toBe("notif-id-456");
  });

  it("still resolves when bridge rejects unexpectedly (non-fatal error path)", async () => {
    mockScheduleOverlayAlarm.mockRejectedValueOnce(new Error("unexpected native error"));
    const futureDate = new Date("2026-03-01T13:00:00.000Z");

    const id = await scheduleAlarm("Task C", futureDate, 3);

    // scheduleAlarm must not throw; expo-notifications id is returned
    expect(id).toBe("notif-id-456");
  });
});
