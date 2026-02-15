import * as Calendar from "expo-calendar";
import { Platform } from "react-native";

export async function requestCalendarPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === "granted";
}

async function getDefaultCalendarId(): Promise<string | null> {
  const calendars = await Calendar.getCalendarsAsync(
    Calendar.EntityTypes.EVENT
  );

  if (Platform.OS === "ios") {
    const defaultCal = await Calendar.getDefaultCalendarAsync();
    return defaultCal.id;
  }

  // Android: find or create a "RandomTime" calendar
  const existing = calendars.find((c) => c.title === "RandomTime");
  if (existing) return existing.id;

  const newCalId = await Calendar.createCalendarAsync({
    title: "RandomTime",
    color: "#6c63ff",
    entityType: Calendar.EntityTypes.EVENT,
    source: {
      isLocalAccount: true,
      name: "RandomTime",
      type: Calendar.CalendarType.LOCAL,
    },
    name: "RandomTime",
    ownerAccount: "personal",
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
  return newCalId;
}

export async function createCalendarEvent(
  title: string,
  startDate: Date,
  durationMinutes: number = 30
): Promise<string> {
  const calId = await getDefaultCalendarId();
  if (!calId) throw new Error("No calendar available");

  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const eventId = await Calendar.createEventAsync(calId, {
    title,
    startDate,
    endDate,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });

  return eventId;
}
