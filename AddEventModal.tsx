import { useState, useEffect } from "react";
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
  ScrollView,
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import {
  requestCalendarPermission,
  createCalendarEvent,
} from "./calendarService";
import {
  requestNotificationPermission,
  scheduleReminder,
  scheduleAlarm,
  cancelNotification,
} from "./notificationService";
import {
  insertTask,
  updateTask,
  updateTaskNotifications,
  Task,
  TaskCategory,
  TaskPriority,
} from "./db";
import * as Haptics from "expo-haptics";
import { useTheme } from "./context/ThemeContext";
import { Colors } from "./theme";

const REMINDER_OPTIONS = [5, 10, 15, 30] as const;
const CATEGORY_OPTIONS: TaskCategory[] = ["Work", "Personal", "Health", "Other"];
const PRIORITY_OPTIONS: TaskPriority[] = ["High", "Medium", "Low"];

function priorityChipColor(p: TaskPriority, colors: Colors): string {
  if (p === "High") return colors.danger;
  if (p === "Medium") return colors.warning;
  return colors.success;
}

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    sheet: {
      backgroundColor: colors.bgCard,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
      maxHeight: "90%",
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.text,
      marginBottom: 20,
      textAlign: "center",
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginBottom: 8,
      marginTop: 12,
    },
    labelSmall: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.textDim,
      marginBottom: 6,
      marginTop: 10,
    },
    textInput: {
      backgroundColor: colors.bgInput,
      color: colors.text,
      fontSize: 16,
      borderRadius: 12,
      padding: 14,
      borderWidth: 2,
      borderColor: colors.bgBorder,
    },
    dateButton: {
      backgroundColor: colors.bgInput,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.bgBorder,
    },
    dateButtonText: {
      color: colors.text,
      fontSize: 15,
      fontWeight: "600",
    },
    textInputMultiline: {
      minHeight: 72,
      textAlignVertical: "top",
    },
    textInputSmall: {
      backgroundColor: colors.bgInput,
      color: colors.text,
      fontSize: 15,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: colors.bgBorder,
      width: 100,
    },
    chipRow: {
      flexDirection: "row",
      gap: 10,
      marginTop: 4,
      flexWrap: "wrap",
    },
    chip: {
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: colors.bgInput,
      borderWidth: 1,
      borderColor: colors.bgBorder,
    },
    chipActive: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    chipText: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.textMuted,
    },
    chipTextActive: {
      color: colors.text,
    },
    buttonRow: {
      flexDirection: "row",
      gap: 12,
      marginTop: 28,
      marginBottom: 8,
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.bgBorder,
      alignItems: "center",
    },
    cancelText: {
      color: colors.textMuted,
      fontSize: 16,
      fontWeight: "600",
    },
    saveButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: colors.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    saveText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "700",
    },
  });
}

interface AddEventModalProps {
  visible: boolean;
  eventHour: number;
  eventMinute: number;
  eventSecond: number;
  onClose: () => void;
  onTaskSaved: () => void;
  editTask?: Task;
  defaultReminderMin?: number;
}

export default function AddEventModal({
  visible,
  eventHour,
  eventMinute,
  eventSecond,
  onClose,
  onTaskSaved,
  editTask,
  defaultReminderMin = 10,
}: AddEventModalProps) {
  const { colors } = useTheme();
  const styles = makeStyles(colors);

  const [taskName, setTaskName] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [category, setCategory] = useState<TaskCategory | null>(null);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [selectedReminders, setSelectedReminders] = useState<number[]>([defaultReminderMin]);
  const [customMinutes, setCustomMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  // Pre-fill fields when editing an existing task
  useEffect(() => {
    if (visible && editTask) {
      setTaskName(editTask.title);
      setNotes(editTask.notes ?? "");
      const d = new Date(editTask.event_date);
      const dateOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      setSelectedDate(dateOnly);
      setSelectedReminders([editTask.reminder_minutes]);
      setCustomMinutes("");
      setCategory(editTask.category ?? null);
      setPriority(editTask.priority ?? null);
    }
  }, [visible, editTask]);

  const effectiveReminderMins: number[] = (() => {
    const all = [...selectedReminders];
    const parsed = parseInt(customMinutes, 10);
    if (!isNaN(parsed) && parsed > 0 && !all.includes(parsed)) all.push(parsed);
    return all.sort((a, b) => b - a); // descending: 30, 10, 5
  })();

  const handleSave = async () => {
    const name = taskName.trim();
    if (!name) {
      Alert.alert("Missing task name", "Please enter a task name.");
      return;
    }
    if (effectiveReminderMins.length === 0) {
      Alert.alert("Invalid reminder", "Select at least one reminder time.");
      return;
    }

    setSaving(true);

    try {
      const srcH = editTask ? new Date(editTask.event_date).getHours() : eventHour;
      const srcM = editTask ? new Date(editTask.event_date).getMinutes() : eventMinute;
      const srcS = editTask ? new Date(editTask.event_date).getSeconds() : eventSecond;

      const eventDate = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        selectedDate.getDate(),
        srcH,
        srcM,
        srcS
      );

      const notifGranted = await requestNotificationPermission();
      let alarmId: string | null = null;
      const reminderIds: string[] = [];

      if (editTask) {
        // ── Edit mode ──────────────────────────────────────────────────────
        // Cancel all old notifications
        if (editTask.alarm_notification_id)
          await cancelNotification(editTask.alarm_notification_id);
        if (editTask.reminder_notification_id)
          await cancelNotification(editTask.reminder_notification_id);
        if (editTask.reminder_notification_ids) {
          const oldIds: string[] = JSON.parse(editTask.reminder_notification_ids);
          for (const id of oldIds) await cancelNotification(id);
        }

        if (notifGranted) {
          for (const mins of effectiveReminderMins) {
            const id = await scheduleReminder(name, eventDate, mins);
            if (id) reminderIds.push(id);
          }
          // Pass editTask.id so notification actions (Done/Postpone) work
          alarmId = await scheduleAlarm(name, eventDate, editTask.id);
        }

        await updateTask(editTask.id, {
          title: name,
          event_date: eventDate.toISOString(),
          reminder_minutes: effectiveReminderMins[0] ?? 10,
          notes: notes.trim() || null,
          alarm_notification_id: alarmId,
          reminder_notification_id: reminderIds[0] ?? null,
          reminder_notification_ids: JSON.stringify(reminderIds),
          category,
          priority,
        });
      } else {
        // ── Create mode ────────────────────────────────────────────────────
        const calGranted = await requestCalendarPermission();
        if (!calGranted) {
          Alert.alert(
            "Calendar permission needed",
            "Please allow calendar access in your device Settings so RandomTime can save events.",
          );
          setSaving(false);
          return;
        }

        let calendarEventId: string | null = null;
        try {
          calendarEventId = await createCalendarEvent(name, eventDate);
        } catch (calErr) {
          // Calendar creation failed (e.g. no Google account on device).
          // We still save the task locally with reminders — just without a
          // calendar event. User is informed.
          Alert.alert(
            "Calendar unavailable",
            "The task will be saved with reminders, but no calendar event could be created. " +
              "Make sure a Google account is added to your device Calendar app and try again.",
          );
        }

        // Insert first so we have the task ID for the alarm notification
        const newTaskId = await insertTask({
          title: name,
          event_date: eventDate.toISOString(),
          reminder_minutes: effectiveReminderMins[0] ?? 10,
          alarm_notification_id: null,
          reminder_notification_id: null,
          reminder_notification_ids: null,
          calendar_event_id: calendarEventId,
          notes: notes.trim() || null,
          category,
          priority,
        });

        if (notifGranted) {
          for (const mins of effectiveReminderMins) {
            const id = await scheduleReminder(name, eventDate, mins);
            if (id) reminderIds.push(id);
          }
          // Now we have newTaskId — pass it so notification actions work
          alarmId = await scheduleAlarm(name, eventDate, newTaskId);

          // Persist notification IDs back to the task row
          await updateTaskNotifications(
            newTaskId,
            alarmId,
            reminderIds[0] ?? null,
            JSON.stringify(reminderIds)
          );
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onTaskSaved();

      if (!notifGranted) {
        Alert.alert(
          editTask ? "Task updated" : "Event created",
          "Saved. Notification permission was denied — no reminders will fire."
        );
      } else if (reminderIds.length === 0 && !alarmId) {
        Alert.alert(
          editTask ? "Task updated" : "Event created",
          "Saved. The event time has already passed so no notifications were scheduled."
        );
      } else {
        const label = effectiveReminderMins.map((m) => `${m} min`).join(", ");
        Alert.alert(
          "Saved",
          `${editTask ? "Task updated" : "Event created"} with reminders at ${label} before and an alarm at event time.`
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
    setNotes("");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    setSelectedDate(today);
    setShowDatePicker(false);
    setSelectedReminders([defaultReminderMin]);
    setCustomMinutes("");
    setCategory(null);
    setPriority(null);
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
          <Text style={styles.title}>{editTask ? "Edit Task" : "Add to Calendar"}</Text>

          {/* Scrollable content so nothing is hidden on small screens */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Task Name */}
            <Text style={styles.label}>Task Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g. Team standup"
              placeholderTextColor={colors.textDim}
              value={taskName}
              onChangeText={setTaskName}
              autoFocus
            />

            {/* Date Picker */}
            <Text style={styles.label}>Date</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => setShowDatePicker(true)}
            >
              <Text style={styles.dateButtonText}>
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: "short",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
            </TouchableOpacity>
            {showDatePicker && (
              <DateTimePicker
                value={selectedDate}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                minimumDate={new Date(new Date().setHours(0, 0, 0, 0))}
                onChange={(event: DateTimePickerEvent, date?: Date) => {
                  setShowDatePicker(Platform.OS === "ios");
                  if (event.type === "set" && date) {
                    setSelectedDate(date);
                  }
                }}
              />
            )}

            {/* Notes */}
            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textInputMultiline]}
              placeholder="Add a note…"
              placeholderTextColor={colors.textDim}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
            />

            {/* Category */}
            <Text style={styles.label}>Category</Text>
            <View style={styles.chipRow}>
              {CATEGORY_OPTIONS.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[styles.chip, category === cat && styles.chipActive]}
                  onPress={() => setCategory(category === cat ? null : cat)}
                >
                  <Text style={[styles.chipText, category === cat && styles.chipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Priority */}
            <Text style={styles.label}>Priority</Text>
            <View style={styles.chipRow}>
              {PRIORITY_OPTIONS.map((p) => {
                const color = priorityChipColor(p, colors);
                const active = priority === p;
                return (
                  <TouchableOpacity
                    key={p}
                    style={[
                      styles.chip,
                      active && { backgroundColor: color, borderColor: color },
                    ]}
                    onPress={() => setPriority(priority === p ? null : p)}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {p}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Reminder chips (multi-select) */}
            <Text style={styles.label}>Remind me before</Text>
            <View style={styles.chipRow}>
              {REMINDER_OPTIONS.map((min) => {
                const active = selectedReminders.includes(min);
                return (
                  <TouchableOpacity
                    key={min}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      setSelectedReminders((prev) =>
                        prev.includes(min)
                          ? prev.filter((r) => r !== min)
                          : [...prev, min]
                      );
                    }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {min} min
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Custom minutes */}
            <Text style={styles.labelSmall}>Or enter custom minutes</Text>
            <TextInput
              style={styles.textInputSmall}
              keyboardType="number-pad"
              placeholder="e.g. 45"
              placeholderTextColor={colors.textDim}
              value={customMinutes}
              onChangeText={setCustomMinutes}
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
                  <ActivityIndicator color={colors.text} size="small" />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
