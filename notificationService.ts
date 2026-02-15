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
  const now = new Date();

  if (triggerDate <= now) {
    return null; // reminder time already passed
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
