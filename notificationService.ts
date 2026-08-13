import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import overlayAlarmBridge, { OverlayAlarmAction } from "./overlayAlarmBridge";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return false;

  if (Platform.OS === "android") {
    // Gentle pre-nudge tier (Phase 10) — a silent heads-up a few minutes
    // before the main reminder. Importance DEFAULT so it doesn't
    // interrupt; just a banner / badge.
    await Notifications.setNotificationChannelAsync("pre_reminders", {
      name: "Gentle Pre-Nudge",
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: null,
      enableVibrate: false,
    });
    await Notifications.setNotificationChannelAsync("reminders", {
      name: "Task Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("alarms", {
      name: "Task Alarms",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 250, 250, 250],
      enableVibrate: true,
    });
  }

  // Register action category for alarm notifications.
  // Phase 10: added "reroll" — semantically distinct from "postpone" in the
  // UI (reroll uses the smart weighted engine; postpone uses uniform random).
  await Notifications.setNotificationCategoryAsync("task_alarm", [
    {
      identifier: "done",
      buttonTitle: "Done",
      options: { isDestructive: false, isAuthenticationRequired: false },
    },
    {
      identifier: "reroll",
      buttonTitle: "Re-roll",
      options: { isDestructive: false, isAuthenticationRequired: false },
    },
    {
      identifier: "postpone",
      buttonTitle: "Postpone",
      options: { isDestructive: false, isAuthenticationRequired: false },
    },
  ]);

  return true;
}

export interface NotificationResponseHandlers {
  onDone: (taskId: number) => void;
  onPostpone: (taskId: number) => void;
  /** Phase 10 — smart re-schedule via weighted engine. Optional for b/c. */
  onReroll?: (taskId: number) => void;
}

export function setupNotificationResponseHandler(
  handlersOrOnDone: NotificationResponseHandlers | ((taskId: number) => void),
  onPostponeLegacy?: (taskId: number) => void
): () => void {
  // Accept either the new object form or the legacy two-arg form so existing
  // call sites keep working.
  const handlers: NotificationResponseHandlers =
    typeof handlersOrOnDone === "function"
      ? { onDone: handlersOrOnDone, onPostpone: onPostponeLegacy ?? (() => {}) }
      : handlersOrOnDone;

  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const actionId = response.actionIdentifier;
      const taskId = response.notification.request.content.data?.taskId as number | undefined;
      if (taskId == null) return;
      if (actionId === "done") handlers.onDone(taskId);
      else if (actionId === "postpone") handlers.onPostpone(taskId);
      else if (actionId === "reroll" && handlers.onReroll) handlers.onReroll(taskId);
    }
  );
  return () => subscription.remove();
}

export async function scheduleReminder(
  title: string,
  eventDate: Date,
  minutesBefore: number
): Promise<string | null> {
  const triggerDate = new Date(
    eventDate.getTime() - minutesBefore * 60 * 1000
  );

  if (triggerDate <= new Date()) {
    return null;
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Reminder",
      body: `"${title}" starts in ${minutesBefore} minutes`,
      sound: "default",
      ...(Platform.OS === "android" && { channelId: "reminders" }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  return id;
}

export async function scheduleAlarm(
  title: string,
  eventDate: Date,
  taskId?: number
): Promise<string | null> {
  if (eventDate <= new Date()) {
    return null;
  }

  // Primary path: expo-notifications (works on all platforms / build flavors).
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Time is now!",
      body: `"${title}" — your random time has arrived.`,
      sound: "default",
      categoryIdentifier: "task_alarm",
      data: taskId != null ? { taskId } : {},
      ...(Platform.OS === "android" && { channelId: "alarms" }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: eventDate,
    },
  });

  // Phase 12 — also wire AlarmManager-based overlay alarm when a taskId is
  // provided and the native bridge is available.  The overlay fires at the
  // same triggerMs and starts OverlayAlarmService via AlarmReceiver.
  // We don't throw on 'unavailable' or 'permission_denied' — expo-notifications
  // above already serves as the fallback.
  if (taskId != null) {
    const triggerAtMs = eventDate.getTime();
    const taskIdStr = String(taskId);
    try {
      const result = await overlayAlarmBridge.scheduleOverlayAlarm(
        taskIdStr,
        title,
        triggerAtMs
      );
      console.log(`[notificationService] scheduleAlarm overlay bridge → ${result.scheduled}`);
    } catch (err) {
      // Non-fatal: log and fall through so expo-notifications alarm still fires.
      console.warn("[notificationService] scheduleAlarm overlay bridge error:", err);
    }
  }

  return id;
}

/**
 * Phase 10 — Gentle pre-nudge.
 * Fires a silent banner a few minutes before the main alarm so the alarm
 * itself isn't a jump-scare. Uses the lower-importance "pre_reminders"
 * Android channel and no sound.
 */
export async function scheduleGentleNudge(
  title: string,
  eventDate: Date,
  minutesBefore: number = 5
): Promise<string | null> {
  const triggerDate = new Date(
    eventDate.getTime() - minutesBefore * 60 * 1000
  );

  if (triggerDate <= new Date()) {
    return null;
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Heads up",
      body: `"${title}" coming up in ${minutesBefore} minutes.`,
      // `false` = silent on iOS/Android; matches the pre_reminders channel config.
      sound: false,
      ...(Platform.OS === "android" && { channelId: "pre_reminders" }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: triggerDate,
    },
  });

  return id;
}

export async function cancelNotification(id: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (err) {
    // Cancelling an ID that has already fired / been cleared by the OS rejects
    // on some Android versions. Callers cancel in a loop before deleting a
    // task, so a throw here would abort the loop and leave the task row (and
    // its remaining notifications) behind. Nothing to recover — log and move on.
    console.warn(`[notificationService] cancelNotification(${id}) failed:`, err);
  }
}

/**
 * Parse a `reminder_notification_ids` column value into a string array.
 *
 * The column holds a JSON array, but rows written by older builds (or a
 * partially-failed write) can contain malformed or non-array JSON. An
 * unguarded `JSON.parse` here would throw inside the delete/reschedule loops
 * and strand the task, so anything unparseable degrades to an empty list.
 */
export function parseNotificationIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string");
  } catch {
    return [];
  }
}

/**
 * Cancel every notification associated with a task: the alarm, the legacy
 * single reminder, all multi-offset reminders, and the native AlarmManager
 * overlay alarm.
 *
 * Callers previously open-coded this in six places and none of them cancelled
 * the overlay alarm — so after deleting a task the native full-screen alarm
 * still fired at the original time for a task that no longer existed.
 *
 * Never throws: each cancel is individually guarded so one bad ID cannot
 * prevent the remaining notifications (or the caller's delete) from happening.
 */
export async function cancelTaskNotifications(task: {
  id: number;
  alarm_notification_id: string | null;
  reminder_notification_id: string | null;
  reminder_notification_ids: string | null;
}): Promise<void> {
  if (task.alarm_notification_id) {
    await cancelNotification(task.alarm_notification_id);
  }
  if (task.reminder_notification_id) {
    await cancelNotification(task.reminder_notification_id);
  }
  for (const id of parseNotificationIds(task.reminder_notification_ids)) {
    await cancelNotification(id);
  }

  // Phase 12 — tear down the AlarmManager overlay alarm keyed by this task id.
  try {
    await overlayAlarmBridge.cancelOverlayAlarm(String(task.id));
  } catch (err) {
    console.warn(
      `[notificationService] cancelOverlayAlarm(${task.id}) failed:`,
      err
    );
  }
}

// ---------------------------------------------------------------------------
// Phase 12 — Overlay alarm integration
// ---------------------------------------------------------------------------

/**
 * Immediately fire the overlay alarm for the given task.
 *
 * If the native overlay module is unavailable or permission is denied, this
 * is a no-op — the underlying expo-notifications alarm that was already
 * scheduled serves as the fallback.
 */
export async function fireOverlayAlarmNow(
  taskId: string,
  title: string
): Promise<void> {
  try {
    const result = await overlayAlarmBridge.fireOverlayAlarm(taskId, title);
    console.log(`[notificationService] fireOverlayAlarmNow → ${result.fired}`);
  } catch (err) {
    // The bridge re-throws native errors other than ERR_OVERLAY_NOT_GRANTED,
    // which contradicts this function's documented no-op contract and would
    // surface as an unhandled rejection at the (fire-and-forget) call sites.
    console.warn("[notificationService] fireOverlayAlarmNow failed:", err);
  }
}

export interface OverlayAlarmResponseHandlers {
  onDone: (taskId: string) => void;
  onPostpone: (taskId: string) => void;
  onReroll: (taskId: string) => void;
}

/**
 * Subscribe to overlay alarm actions (done / postpone / reroll).
 *
 * Routes each incoming OverlayAlarmAction to the corresponding handler.
 * Returns a cleanup function that removes the subscription.
 *
 * When running in Jest or any environment where the native OverlayAlarm
 * module is absent, this is a no-op (bridge returns a no-op unsubscribe).
 */
export function setupOverlayAlarmResponseHandler(
  handlers: OverlayAlarmResponseHandlers
): () => void {
  return overlayAlarmBridge.onAlarmAction((payload: OverlayAlarmAction) => {
    switch (payload.action) {
      case "done":
        handlers.onDone(payload.taskId);
        break;
      case "postpone":
        handlers.onPostpone(payload.taskId);
        break;
      case "reroll":
        handlers.onReroll(payload.taskId);
        break;
    }
  });
}
