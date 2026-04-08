import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { Task } from "../db";
import { useTheme } from "../context/ThemeContext";
import { Colors } from "../theme";
import { formatTime24, formatTime12 } from "../utils/timeUtils";

export function priorityColor(p: string, colors: Colors): string {
  if (p === "High") return colors.danger;
  if (p === "Medium") return colors.warning;
  return colors.success;
}

function relativeDate(dateStr: string): string {
  const today = new Date();
  const d = new Date(dateStr);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((dMidnight.getTime() - todayMidnight.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return `In ${diffDays} days`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
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

function makeStyles(colors: Colors) {
  return StyleSheet.create({
    taskItem: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.bgCard,
      borderRadius: 10,
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 6,
    },
    taskItemToday: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accent,
    },
    taskItemOverdue: {
      borderLeftWidth: 3,
      borderLeftColor: colors.danger,
    },
    taskItemDone: {
      opacity: 0.5,
    },
    taskItemSelected: {
      borderWidth: 1,
      borderColor: colors.accent,
      backgroundColor: "#1f1f35",
    },
    taskMetaToday: {
      color: colors.accent,
      fontWeight: "700",
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.bgBorder,
      marginRight: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxDone: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    checkmark: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    taskInfo: {
      flex: 1,
    },
    taskTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.text,
      marginBottom: 4,
    },
    taskTitleDone: {
      textDecorationLine: "line-through",
      color: colors.textDim,
    },
    taskMeta: {
      fontSize: 12,
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    taskNotes: {
      fontSize: 12,
      color: colors.textDim,
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
      backgroundColor: colors.bgInput,
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 8,
    },
    categoryBadgeText: {
      fontSize: 11,
      color: colors.textMuted,
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
      borderColor: `${colors.success}44`,
      alignItems: "center",
      justifyContent: "center",
    },
    taskShareText: {
      color: colors.success,
      fontSize: 15,
      fontWeight: "700",
    },
    taskEditButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${colors.textMuted}44`,
      alignItems: "center",
      justifyContent: "center",
    },
    taskEditText: {
      color: colors.textMuted,
      fontSize: 15,
      fontWeight: "700",
    },
    taskPostponeButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${colors.accent}44`,
      alignItems: "center",
      justifyContent: "center",
    },
    taskPostponeText: {
      color: colors.accent,
      fontSize: 16,
      fontWeight: "700",
    },
    taskDeleteButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${colors.danger}44`,
      alignItems: "center",
      justifyContent: "center",
    },
    taskDeleteText: {
      color: colors.danger,
      fontSize: 14,
      fontWeight: "700",
    },
  });
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
  const { colors } = useTheme();
  const styles = makeStyles(colors);
  const eventDate = new Date(task.event_date);
  const h = eventDate.getHours();
  const m = eventDate.getMinutes();
  const s = eventDate.getSeconds();
  const timeLabel = is24h ? formatTime24(h, m, s) : formatTime12(h, m, s);
  const isDone = task.status === "done";
  const dateLabel = relativeDate(task.event_date);
  const isToday = dateLabel === "Today";
  const isOverdue =
    !isDone && new Date(task.event_date).getTime() < Date.now();

  return (
    <TouchableOpacity
      onLongPress={() => onLongPress(task)}
      activeOpacity={0.8}
      style={[
        styles.taskItem,
        isToday && !isDone && styles.taskItemToday,
        isOverdue && styles.taskItemOverdue,
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
          <Text style={isToday && !isDone ? styles.taskMetaToday : undefined}>
            {dateLabel}
          </Text>
          {" · "}
          {timeLabel}
          {isOverdue && !isDone ? "  ⚠ overdue" : ""}
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
                  { borderColor: priorityColor(task.priority, colors) },
                ]}
              >
                <Text
                  style={[
                    styles.priorityBadgeText,
                    { color: priorityColor(task.priority, colors) },
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
