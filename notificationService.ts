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

  return true;
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
  eventDate: Date
): Promise<string | null> {
  if (eventDate <= new Date()) {
    return null;
  }

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: "Time is now!",
      body: `"${title}" — your random time has arrived.`,
      sound: "default",
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
