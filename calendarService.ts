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

  // Android: calendars must be tied to a real device account (e.g. Google).
  // Creating a CalendarType.LOCAL calendar fails silently on many devices
  // because Android requires an account source. Instead we:
  //   1. Reuse our own "RandomTime" calendar if it already exists.
  //   2. Otherwise pick any writable calendar (Google, etc.) already on device.
  //   3. Last resort: attempt to create a local calendar using the first
  //      available account source from the device.

  // Step 1 — reuse existing RandomTime calendar
  const existing = calendars.find(
    (c) => c.title === "RandomTime" && c.allowsModifications
  );
  if (existing) return existing.id;

  // Step 2 — use any already-writable calendar on the device
  const writable = calendars.filter((c) => c.allowsModifications);
  if (writable.length > 0) {
    // Prefer a Google / CalDAV synced calendar over a local one
    const synced = writable.find(
      (c) =>
        c.source?.type === Calendar.CalendarType.CALDAV ||
        c.source?.name?.toLowerCase().includes("google") ||
        c.source?.name?.toLowerCase().includes("gmail")
    );
    return (synced ?? writable[0]).id;
  }

  // Step 3 — no writable calendar found; try to create a local one using
  // the first available source so Android has a valid account to attach to.
  const sources = await Calendar.getSourcesAsync();
  const source = sources[0];
  if (!source) return null;

  const newCalId = await Calendar.createCalendarAsync({
    title: "RandomTime",
    color: "#6c63ff",
    entityType: Calendar.EntityTypes.EVENT,
    source,
    name: "RandomTime",
    ownerAccount: source.name,
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
