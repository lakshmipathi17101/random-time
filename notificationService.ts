import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

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

  // Register action category for alarm notifications
  await Notifications.setNotificationCategoryAsync("task_alarm", [
    {
      identifier: "done",
      buttonTitle: "Done",
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

export function setupNotificationResponseHandler(
  onDone: (taskId: number) => void,
  onPostpone: (taskId: number) => void
): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const actionId = response.actionIdentifier;
      const taskId = response.notification.request.content.data?.taskId as number | undefined;
      if (taskId == null) return;
      if (actionId === "done") onDone(taskId);
      else if (actionId === "postpone") onPostpone(taskId);
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

  return id;
}

export async function cancelNotification(id: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(id);
}
