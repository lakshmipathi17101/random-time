import { useState, useCallback, useMemo } from "react";
import { Alert, Share } from "react-native";
import * as Haptics from "expo-haptics";
import {
  getTasks,
  getDoneTasks,
  deleteTask,
  updateTaskStatus,
  Task,
} from "../db";
import { cancelTaskNotifications } from "../notificationService";
import { formatTime24, formatTime12 } from "../utils/timeUtils";

export interface UseTasksResult {
  tasks: Task[];
  dbReady: boolean;
  loadTasks: () => Promise<void>;
  selectedIds: Set<number>;
  handleLongPress: (task: Task) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  filterStatus: "all" | "pending" | "done";
  setFilterStatus: (f: "all" | "pending" | "done") => void;
  sortBy: "time" | "priority" | "created";
  setSortBy: (s: "time" | "priority" | "created") => void;
  displayedTasks: Task[];
  handleDeleteTask: (task: Task) => void;
  handleBulkDelete: () => void;
  handleDeleteAllDone: () => void;
  handleToggleDone: (task: Task) => Promise<void>;
  handleShareTask: (task: Task, is24h: boolean) => void;
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [dbReady, setDbReady] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "done">("all");
  const [sortBy, setSortBy] = useState<"time" | "priority" | "created">("time");

  const loadTasks = useCallback(async () => {
    const fetched = await getTasks();
    setTasks(fetched);
    setDbReady(true);
  }, []);

  const priorityRank = useCallback((p: string | null) => {
    if (p === "High") return 0;
    if (p === "Medium") return 1;
    return 2;
  }, []);

  const displayedTasks = useMemo(() => {
    let list = [...tasks];
    if (filterStatus !== "all")
      list = list.filter((t) => t.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q));
    }
    if (sortBy === "priority")
      list.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
    else if (sortBy === "created")
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    else
      list.sort((a, b) => a.event_date.localeCompare(b.event_date));
    return list;
  }, [tasks, filterStatus, searchQuery, sortBy, priorityRank]);

  const handleLongPress = useCallback((task: Task) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(task.id)) next.delete(task.id);
      else next.add(task.id);
      return next;
    });
  }, []);

  const handleDeleteTask = useCallback(
    (task: Task) => {
      Alert.alert(
        "Delete Task",
        `Delete "${task.title}"? Scheduled notifications will also be cancelled.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              await cancelTaskNotifications(task);
              await deleteTask(task.id);
              await loadTasks();
            },
          },
        ]
      );
    },
    [loadTasks]
  );

  const handleBulkDelete = useCallback(() => {
    Alert.alert(
      "Delete Selected",
      `Delete ${selectedIds.size} task(s)? Notifications will be cancelled.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            for (const id of selectedIds) {
              const task = tasks.find((t) => t.id === id);
              if (!task) continue;
              await cancelTaskNotifications(task);
              await deleteTask(id);
            }
            setSelectedIds(new Set());
            await loadTasks();
          },
        },
      ]
    );
  }, [selectedIds, tasks, loadTasks]);

  const handleDeleteAllDone = useCallback(() => {
    Alert.alert(
      "Delete All Done",
      "Remove all completed tasks? Their notifications will be cancelled.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const done = await getDoneTasks();
            for (const task of done) {
              await cancelTaskNotifications(task);
              await deleteTask(task.id);
            }
            await loadTasks();
          },
        },
      ]
    );
  }, [loadTasks]);

  const handleToggleDone = useCallback(
    async (task: Task) => {
      const newStatus = task.status === "done" ? "pending" : "done";
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await updateTaskStatus(task.id, newStatus);
      await loadTasks();
    },
    [loadTasks]
  );

  const handleShareTask = useCallback((task: Task, is24h: boolean) => {
    const d = new Date(task.event_date);
    const dateStr = d.toLocaleDateString(undefined, {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
    });
    const h = d.getHours();
    const m = d.getMinutes();
    const s = d.getSeconds();
    const timeStr = is24h ? formatTime24(h, m, s) : formatTime12(h, m, s);
    const lines = [`📅 ${task.title}`, `🕐 ${dateStr} at ${timeStr}`];
    if (task.category) lines.push(`🏷 ${task.category}`);
    if (task.priority) lines.push(`⚡ Priority: ${task.priority}`);
    if (task.notes) lines.push(`📝 ${task.notes}`);
    Share.share({ message: lines.join("\n") });
  }, []);

  return {
    tasks,
    dbReady,
    loadTasks,
    selectedIds,
    handleLongPress,
    searchQuery,
    setSearchQuery,
    filterStatus,
    setFilterStatus,
    sortBy,
    setSortBy,
    displayedTasks,
    handleDeleteTask,
    handleBulkDelete,
    handleDeleteAllDone,
    handleToggleDone,
    handleShareTask,
  };
}
