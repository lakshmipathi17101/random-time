import { StyleSheet, Text, View, TextInput, TouchableOpacity } from "react-native";
import { Task } from "../db";
import { darkColors } from "../theme";
import TaskListItem from "./TaskListItem";

interface TaskListProps {
  displayedTasks: Task[];
  is24h: boolean;
  selectedIds: Set<number>;
  searchQuery: string;
  filterStatus: "all" | "pending" | "done";
  sortBy: "time" | "priority" | "created";
  onSearchChange: (q: string) => void;
  onFilterChange: (f: "all" | "pending" | "done") => void;
  onSortChange: (s: "time" | "priority" | "created") => void;
  onDelete: (task: Task) => void;
  onToggleDone: (task: Task) => void;
  onPostpone: (task: Task) => void;
  onEdit: (task: Task) => void;
  onShare: (task: Task) => void;
  onLongPress: (task: Task) => void;
  onBulkDelete: () => void;
}

export default function TaskList({
  displayedTasks,
  is24h,
  selectedIds,
  searchQuery,
  filterStatus,
  sortBy,
  onSearchChange,
  onFilterChange,
  onSortChange,
  onDelete,
  onToggleDone,
  onPostpone,
  onEdit,
  onShare,
  onLongPress,
  onBulkDelete,
}: TaskListProps) {
  return (
    <View style={styles.taskListContainer}>
      <View style={styles.taskListHeader}>
        <Text style={styles.taskListTitle}>Saved Tasks</Text>
        {selectedIds.size > 0 && (
          <TouchableOpacity style={styles.bulkDeleteButton} onPress={onBulkDelete}>
            <Text style={styles.bulkDeleteText}>Delete {selectedIds.size}</Text>
          </TouchableOpacity>
        )}
      </View>

      <TextInput
        style={styles.searchInput}
        placeholder="Search tasks…"
        placeholderTextColor={darkColors.textDim}
        value={searchQuery}
        onChangeText={onSearchChange}
      />

      <View style={styles.filterRow}>
        {(["all", "pending", "done"] as const).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filterStatus === f && styles.filterChipActive]}
            onPress={() => onFilterChange(f)}
          >
            <Text
              style={[
                styles.filterChipText,
                filterStatus === f && styles.filterChipTextActive,
              ]}
            >
              {f === "all" ? "All" : f === "pending" ? "Pending" : "Done"}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={styles.filterSpacer} />
        {(["time", "priority", "created"] as const).map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.sortChip, sortBy === s && styles.sortChipActive]}
            onPress={() => onSortChange(s)}
          >
            <Text
              style={[
                styles.sortChipText,
                sortBy === s && styles.sortChipTextActive,
              ]}
            >
              {s === "time" ? "Time" : s === "priority" ? "Priority" : "Created"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {displayedTasks.map((task) => (
        <TaskListItem
          key={task.id}
          task={task}
          is24h={is24h}
          onDelete={onDelete}
          onToggleDone={onToggleDone}
          onPostpone={onPostpone}
          onEdit={onEdit}
          onShare={onShare}
          selected={selectedIds.has(task.id)}
          onLongPress={onLongPress}
        />
      ))}

      {displayedTasks.length === 0 && (
        <Text style={styles.emptyText}>No tasks match.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  taskListContainer: {
    marginTop: 32,
    width: "100%",
    maxWidth: 400,
  },
  taskListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  taskListTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: darkColors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  bulkDeleteButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: `${darkColors.danger}22`,
    borderWidth: 1,
    borderColor: `${darkColors.danger}44`,
  },
  bulkDeleteText: {
    color: darkColors.danger,
    fontSize: 12,
    fontWeight: "700",
  },
  searchInput: {
    backgroundColor: darkColors.bgCard,
    color: darkColors.text,
    fontSize: 14,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: darkColors.bgBorder,
    marginBottom: 10,
    width: "100%",
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    flexWrap: "wrap",
  },
  filterChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: darkColors.bgCard,
    borderWidth: 1,
    borderColor: darkColors.bgBorder,
  },
  filterChipActive: {
    backgroundColor: `${darkColors.accent}22`,
    borderColor: darkColors.accent,
  },
  filterChipText: {
    fontSize: 12,
    color: darkColors.textMuted,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: darkColors.accent,
  },
  filterSpacer: {
    flex: 1,
  },
  sortChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: darkColors.bgCard,
    borderWidth: 1,
    borderColor: darkColors.bgBorder,
  },
  sortChipActive: {
    backgroundColor: darkColors.bgInput,
    borderColor: darkColors.textMuted,
  },
  sortChipText: {
    fontSize: 11,
    color: darkColors.textDim,
    fontWeight: "600",
  },
  sortChipTextActive: {
    color: "#aaaacc",
  },
  emptyText: {
    color: darkColors.textDim,
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
  },
});
