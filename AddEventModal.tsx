import { useState, useEffect, useMemo } from "react";
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
import { insertTask, updateTask, Task, TaskCategory, TaskPriority } from "./db";
import * as Haptics from "expo-haptics";
import { DARK, LIGHT, AppTheme } from "./theme";

const REMINDER_OPTIONS = [5, 10, 15, 30] as const;
const CATEGORY_OPTIONS: TaskCategory[] = ["Work", "Personal", "Health", "Other"];
const PRIORITY_OPTIONS: TaskPriority[] = ["High", "Medium", "Low"];

interface AddEventModalProps {
  visible: boolean;
  eventHour: number;
  eventMinute: number;
  eventSecond: number;
  onClose: () => void;
  onTaskSaved: () => void;
  editTask?: Task;
  defaultReminderMin?: number;
  isDark?: boolean;
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
  isDark = true,
}: AddEventModalProps) {
  const theme: AppTheme = isDark ? DARK : LIGHT;
  const s = useMemo(() => makeStyles(theme), [theme]);

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
    return all.sort((a, b) => b - a);
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
        // Edit mode: cancel all old notifications
        if (editTask.alarm_notification_id) await cancelNotification(editTask.alarm_notification_id);
        if (editTask.reminder_notification_id) await cancelNotification(editTask.reminder_notification_id);
        if (editTask.reminder_notification_ids) {
          const oldIds: string[] = JSON.parse(editTask.reminder_notification_ids);
          for (const id of oldIds) await cancelNotification(id);
        }

        if (notifGranted) {
          for (const mins of effectiveReminderMins) {
            const id = await scheduleReminder(name, eventDate, mins);
            if (id) reminderIds.push(id);
          }
          alarmId = await scheduleAlarm(name, eventDate);
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
        // Create mode
        const calGranted2 = await requestCalendarPermission();
        if (!calGranted2) {
          Alert.alert("Permission denied", "Calendar access is needed to create events.");
          setSaving(false);
          return;
        }

        const calendarEventId = await createCalendarEvent(name, eventDate);

        if (notifGranted) {
          for (const mins of effectiveReminderMins) {
            const id = await scheduleReminder(name, eventDate, mins);
            if (id) reminderIds.push(id);
          }
          alarmId = await scheduleAlarm(name, eventDate);
        }

        await insertTask({
          title: name,
          event_date: eventDate.toISOString(),
          reminder_minutes: effectiveReminderMins[0] ?? 10,
          alarm_notification_id: alarmId,
          reminder_notification_id: reminderIds[0] ?? null,
          reminder_notification_ids: JSON.stringify(reminderIds),
          calendar_event_id: calendarEventId,
          notes: notes.trim() || null,
          category,
          priority,
        });
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
        style={s.overlay}
      >
        <ScrollView
          style={s.sheetScroll}
          contentContainerStyle={s.sheet}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.title}>{editTask ? "Edit Task" : "Add to Calendar"}</Text>

          {/* Task Name */}
          <Text style={s.label}>Task Name</Text>
          <TextInput
            style={s.textInput}
            placeholder="e.g. Team standup"
            placeholderTextColor={theme.textDim}
            value={taskName}
            onChangeText={setTaskName}
            autoFocus
          />

          {/* Date Picker */}
          <Text style={s.label}>Date</Text>
          <TouchableOpacity style={s.dateButton} onPress={() => setShowDatePicker(true)}>
            <Text style={s.dateButtonText}>
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
          <Text style={s.label}>Notes (optional)</Text>
          <TextInput
            style={[s.textInput, s.textInputMultiline]}
            placeholder="Add a note…"
            placeholderTextColor={theme.textDim}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />

          {/* Category */}
          <Text style={s.label}>Category</Text>
          <View style={s.chipRow}>
            {CATEGORY_OPTIONS.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[s.chip, category === cat && s.chipActive]}
                onPress={() => setCategory(category === cat ? null : cat)}
              >
                <Text style={[s.chipText, category === cat && s.chipTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Priority */}
          <Text style={s.label}>Priority</Text>
          <View style={s.chipRow}>
            {PRIORITY_OPTIONS.map((p) => {
              const color = p === "High" ? "#ff6b6b" : p === "Medium" ? "#f5a623" : "#4caf50";
              const active = priority === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[s.chip, active && { backgroundColor: color, borderColor: color }]}
                  onPress={() => setPriority(priority === p ? null : p)}
                >
                  <Text style={[s.chipText, active && s.chipTextActive]}>{p}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Reminder Chips (multi-select) */}
          <Text style={s.label}>Remind me before</Text>
          <View style={s.chipRow}>
            {REMINDER_OPTIONS.map((min) => {
              const active = selectedReminders.includes(min);
              return (
                <TouchableOpacity
                  key={min}
                  style={[s.chip, active && s.chipActive]}
                  onPress={() => {
                    setSelectedReminders((prev) =>
                      prev.includes(min)
                        ? prev.filter((r) => r !== min)
                        : [...prev, min]
                    );
                  }}
                >
                  <Text style={[s.chipText, active && s.chipTextActive]}>{min} min</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Custom Minutes */}
          <Text style={s.labelSmall}>Or enter custom minutes</Text>
          <TextInput
            style={s.textInputSmall}
            keyboardType="number-pad"
            placeholder="e.g. 45"
            placeholderTextColor={theme.textDim}
            value={customMinutes}
            onChangeText={setCustomMinutes}
            maxLength={4}
          />

          {/* Buttons */}
          <View style={s.buttonRow}>
            <TouchableOpacity style={s.cancelButton} onPress={resetAndClose} disabled={saving}>
              <Text style={s.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.saveButton} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={s.saveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(0,0,0,0.6)",
    },
    sheetScroll: {
      maxHeight: "92%",
    },
    sheet: {
      backgroundColor: t.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      paddingBottom: 40,
    },
    title: {
      fontSize: 22,
      fontWeight: "800",
      color: t.text,
      marginBottom: 20,
      textAlign: "center",
    },
    label: {
      fontSize: 13,
      fontWeight: "600",
      color: t.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1.2,
      marginBottom: 8,
      marginTop: 12,
    },
    labelSmall: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textDim,
      marginBottom: 6,
      marginTop: 10,
    },
    textInput: {
      backgroundColor: t.surface2,
      color: t.text,
      fontSize: 16,
      borderRadius: 12,
      padding: 14,
      borderWidth: 2,
      borderColor: t.border,
    },
    dateButton: {
      backgroundColor: t.surface2,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: t.border,
    },
    dateButtonText: {
      color: t.text,
      fontSize: 15,
      fontWeight: "600",
    },
    textInputMultiline: {
      minHeight: 72,
      textAlignVertical: "top",
    },
    textInputSmall: {
      backgroundColor: t.surface2,
      color: t.text,
      fontSize: 15,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: t.border,
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
      backgroundColor: t.surface2,
      borderWidth: 1,
      borderColor: t.border,
    },
    chipActive: {
      backgroundColor: t.accent,
      borderColor: t.accent,
    },
    chipText: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textMuted,
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
      borderColor: t.border,
      alignItems: "center",
    },
    cancelText: {
      color: t.textMuted,
      fontSize: 16,
      fontWeight: "600",
    },
    saveButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: t.accent,
      alignItems: "center",
      justifyContent: "center",
    },
    saveText: {
      color: "#ffffff",
      fontSize: 16,
      fontWeight: "700",
    },
  });
}
