import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { Task } from "../db";
import { darkColors } from "../theme";
import { formatTime24, formatTime12 } from "../utils/timeUtils";

export function priorityColor(p: string): string {
  if (p === "High") return darkColors.danger;
  if (p === "Medium") return darkColors.warning;
  return darkColors.success;
}

interface TaskListItemProps {
  task: Task;
  is24h: boolean;
  onDelete: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onPostpone: (task: Task) => void;
  onEdit: (task: Task) => void;
  onShare: (task: Task) => void;
  selected: boolean;
  onLongPress: (task: Task) => void;
}

export default function TaskListItem({
  task,
  is24h,
  onDelete,
  onToggleDone,
  onPostpone,
  onEdit,
  onShare,
  selected,
  onLongPress,
}: TaskListItemProps) {
  const eventDate = new Date(task.event_date);
  const h = eventDate.getHours();
  const m = eventDate.getMinutes();
  const s = eventDate.getSeconds();
  const timeLabel = is24h ? formatTime24(h, m, s) : formatTime12(h, m, s);
  const isDone = task.status === "done";

  return (
    <TouchableOpacity
      onLongPress={() => onLongPress(task)}
      activeOpacity={0.8}
      style={[
        styles.taskItem,
        isDone && styles.taskItemDone,
        selected && styles.taskItemSelected,
      ]}
    >
      <TouchableOpacity
        style={[styles.checkbox, isDone && styles.checkboxDone]}
        onPress={() => onToggleDone(task)}
      >
        {isDone && <Text style={styles.checkmark}>✓</Text>}
      </TouchableOpacity>

      <View style={styles.taskInfo}>
        <Text style={[styles.taskTitle, isDone && styles.taskTitleDone]}>
          {task.title}
        </Text>
        <Text style={styles.taskMeta}>
          {eventDate.toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}{" "}
          · {timeLabel} · -{task.reminder_minutes} min reminder
        </Text>
        {(task.category || task.priority) && (
          <View style={styles.taskBadgeRow}>
            {task.category && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{task.category}</Text>
              </View>
            )}
            {task.priority && (
              <View
                style={[
                  styles.priorityBadge,
                  { borderColor: priorityColor(task.priority) },
                ]}
              >
                <Text
                  style={[
                    styles.priorityBadgeText,
                    { color: priorityColor(task.priority) },
                  ]}
                >
                  {task.priority}
                </Text>
              </View>
            )}
          </View>
        )}
        {task.notes ? (
          <Text style={styles.taskNotes} numberOfLines={2}>
            {task.notes}
          </Text>
        ) : null}
      </View>

      <View style={styles.taskActions}>
        <TouchableOpacity
          style={styles.taskShareButton}
          onPress={() => onShare(task)}
        >
          <Text style={styles.taskShareText}>↑</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.taskEditButton}
          onPress={() => onEdit(task)}
        >
          <Text style={styles.taskEditText}>✎</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.taskPostponeButton}
          onPress={() => onPostpone(task)}
        >
          <Text style={styles.taskPostponeText}>↻</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.taskDeleteButton}
          onPress={() => onDelete(task)}
        >
          <Text style={styles.taskDeleteText}>✕</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: darkColors.bgCard,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  taskItemDone: {
    opacity: 0.6,
  },
  taskItemSelected: {
    borderWidth: 1,
    borderColor: darkColors.accent,
    backgroundColor: "#1f1f35",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: darkColors.bgBorder,
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: {
    backgroundColor: darkColors.accent,
    borderColor: darkColors.accent,
  },
  checkmark: {
    color: darkColors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: darkColors.text,
    marginBottom: 4,
  },
  taskTitleDone: {
    textDecorationLine: "line-through",
    color: darkColors.textDim,
  },
  taskMeta: {
    fontSize: 12,
    color: darkColors.textMuted,
    letterSpacing: 0.5,
  },
  taskNotes: {
    fontSize: 12,
    color: darkColors.textDim,
    marginTop: 4,
    fontStyle: "italic",
  },
  taskBadgeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
    flexWrap: "wrap",
  },
  categoryBadge: {
    backgroundColor: darkColors.bgInput,
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    color: darkColors.textMuted,
    fontWeight: "600",
  },
  priorityBadge: {
    borderRadius: 6,
    borderWidth: 1,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  taskActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  taskShareButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${darkColors.success}44`,
    alignItems: "center",
    justifyContent: "center",
  },
  taskShareText: {
    color: darkColors.success,
    fontSize: 15,
    fontWeight: "700",
  },
  taskEditButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${darkColors.textMuted}44`,
    alignItems: "center",
    justifyContent: "center",
  },
  taskEditText: {
    color: darkColors.textMuted,
    fontSize: 15,
    fontWeight: "700",
  },
  taskPostponeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${darkColors.accent}44`,
    alignItems: "center",
    justifyContent: "center",
  },
  taskPostponeText: {
    color: darkColors.accent,
    fontSize: 16,
    fontWeight: "700",
  },
  taskDeleteButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: `${darkColors.danger}44`,
    alignItems: "center",
    justifyContent: "center",
  },
  taskDeleteText: {
    color: darkColors.danger,
    fontSize: 14,
    fontWeight: "700",
  },
});
