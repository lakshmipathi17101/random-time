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
  await Notifications.cancelScheduledNotificationAsync(id);
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
  const result = await overlayAlarmBridge.fireOverlayAlarm(taskId, title);
  console.log(`[notificationService] fireOverlayAlarmNow → ${result.fired}`);
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

// ---------------------------------------------------------------------------
// Phase 14 — App icon badge
// ---------------------------------------------------------------------------

/**
 * Sets the app icon badge count via expo-notifications.
 *
 * `count` is normalised to a non-negative integer before being passed
 * along (negative and fractional inputs are clamped/truncated). Badge
 * support is best-effort: some launchers (notably many Android ones)
 * don't support badges at all, in which case `setBadgeCountAsync`
 * resolves `false` rather than throwing. A thrown error is also treated
 * as a non-fatal `false` result — this must never crash or reject into
 * the caller.
 */
export async function setBadgeCount(count: number): Promise<boolean> {
  const normalized = Math.max(0, Math.trunc(count));
  try {
    return await Notifications.setBadgeCountAsync(normalized);
  } catch {
    return false;
  }
}

/** Clears the app icon badge (sets it to 0). */
export async function clearBadge(): Promise<boolean> {
  return setBadgeCount(0);
}
