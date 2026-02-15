import { useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  requestCalendarPermission,
  createCalendarEvent,
} from "./calendarService";
import {
  requestNotificationPermission,
  scheduleReminder,
  scheduleAlarm,
} from "./notificationService";
import { insertTask } from "./db";

const REMINDER_OPTIONS = [5, 10, 15, 30] as const;

interface AddEventModalProps {
  visible: boolean;
  eventHour: number;
  eventMinute: number;
  eventSecond: number;
  onClose: () => void;
  onTaskSaved: () => void;
}

export default function AddEventModal({
  visible,
  eventHour,
  eventMinute,
  eventSecond,
  onClose,
  onTaskSaved,
}: AddEventModalProps) {
  const [taskName, setTaskName] = useState("");
  const [reminderMin, setReminderMin] = useState(10);
  const [customMinutes, setCustomMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  const effectiveReminderMin: number = (() => {
    const parsed = parseInt(customMinutes, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
    return reminderMin;
  })();

  const handleSave = async () => {
    const name = taskName.trim();
    if (!name) {
      Alert.alert("Missing task name", "Please enter a task name.");
      return;
    }
    if (effectiveReminderMin <= 0) {
      Alert.alert("Invalid reminder", "Enter a reminder time greater than 0.");
      return;
    }

    setSaving(true);

    try {
      const calGranted = await requestCalendarPermission();
      if (!calGranted) {
        Alert.alert(
          "Permission denied",
          "Calendar access is needed to create events."
        );
        setSaving(false);
        return;
      }

      const now = new Date();
      const eventDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        eventHour,
        eventMinute,
        eventSecond
      );

      const calendarEventId = await createCalendarEvent(name, eventDate);

      const notifGranted = await requestNotificationPermission();

      let reminderId: string | null = null;
      let alarmId: string | null = null;

      if (notifGranted) {
        reminderId = await scheduleReminder(name, eventDate, effectiveReminderMin);
        alarmId = await scheduleAlarm(name, eventDate);
      }

      await insertTask({
        title: name,
        event_date: eventDate.toISOString(),
        reminder_minutes: effectiveReminderMin,
        alarm_notification_id: alarmId,
        reminder_notification_id: reminderId,
        calendar_event_id: calendarEventId,
      });

      onTaskSaved();

      if (!notifGranted) {
        Alert.alert(
          "Event created",
          "Calendar event saved. Notification permission was denied — no reminders will fire."
        );
      } else if (!reminderId && !alarmId) {
        Alert.alert(
          "Event created",
          "Calendar event saved. The event time has already passed so no notifications were scheduled."
        );
      } else {
        Alert.alert(
          "Saved",
          `Event created with a ${effectiveReminderMin} min reminder and an alarm at the event time.`
        );
      }

      resetAndClose();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      Alert.alert("Error", msg);
    } finally {
      setSaving(false);
    }
  };

  const resetAndClose = () => {
    setTaskName("");
    setReminderMin(10);
    setCustomMinutes("");
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={resetAndClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>Add to Calendar</Text>

          {/* Task Name */}
          <Text style={styles.label}>Task Name</Text>
          <TextInput
            style={styles.textInput}
            placeholder="e.g. Team standup"
            placeholderTextColor="#666680"
            value={taskName}
            onChangeText={setTaskName}
            autoFocus
          />

          {/* Reminder Chips */}
          <Text style={styles.label}>Remind me before</Text>
          <View style={styles.chipRow}>
            {REMINDER_OPTIONS.map((min) => (
              <TouchableOpacity
                key={min}
                style={[styles.chip, reminderMin === min && !customMinutes && styles.chipActive]}
                onPress={() => {
                  setReminderMin(min);
                  setCustomMinutes("");
                }}
              >
                <Text
                  style={[
                    styles.chipText,
                    reminderMin === min && !customMinutes && styles.chipTextActive,
                  ]}
                >
                  {min} min
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Custom Minutes */}
          <Text style={styles.labelSmall}>Or enter custom minutes</Text>
          <TextInput
            style={styles.textInputSmall}
            keyboardType="number-pad"
            placeholder="e.g. 45"
            placeholderTextColor="#666680"
            value={customMinutes}
            onChangeText={(v) => {
              setCustomMinutes(v);
              setReminderMin(0);
            }}
            maxLength={4}
          />

          {/* Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={resetAndClose}
              disabled={saving}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.saveButton}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  sheet: {
    backgroundColor: "#1a1a2e",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
    marginBottom: 20,
    textAlign: "center",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 12,
  },
  labelSmall: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666680",
    marginBottom: 6,
    marginTop: 10,
  },
  textInput: {
    backgroundColor: "#2a2a40",
    color: "#ffffff",
    fontSize: 16,
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: "#3a3a55",
  },
  textInputSmall: {
    backgroundColor: "#2a2a40",
    color: "#ffffff",
    fontSize: 15,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#3a3a55",
    width: 100,
  },
  chipRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: "#2a2a40",
    borderWidth: 1,
    borderColor: "#3a3a55",
  },
  chipActive: {
    backgroundColor: "#6c63ff",
    borderColor: "#6c63ff",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8888aa",
  },
  chipTextActive: {
    color: "#ffffff",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 28,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3a3a55",
    alignItems: "center",
  },
  cancelText: {
    color: "#8888aa",
    fontSize: 16,
    fontWeight: "600",
  },
  saveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "#6c63ff",
    alignItems: "center",
    justifyContent: "center",
  },
  saveText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },
});
