import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  FlatList,
  Alert,
  Share,
} from "react-native";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import AddEventModal from "./AddEventModal";
import OnboardingScreen from "./OnboardingScreen";
import PresetsModal from "./PresetsModal";
import {
  getDb,
  getTasks,
  getDoneTasks,
  deleteTask,
  updateTaskStatus,
  updateTaskTime,
  getSetting,
  upsertSetting,
  Task,
  TaskPriority,
  WeightedRange,
  ExcludedBlock,
  PresetConfig,
} from "./db";
import {
  cancelNotification,
  setupNotificationResponseHandler,
  scheduleSnoozeAlarm,
} from "./notificationService";
import {
  generateWeightedRandom,
  hmsToSeconds,
  secondsToHms,
  secondsToLabel,
} from "./weightedRandom";

const MAX_HISTORY = 10;

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatTime24(h: number, m: number, s: number): string {
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function formatTime12(h: number, m: number, s: number): string {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${pad(h12)}:${pad(m)}:${pad(s)} ${period}`;
}

interface TimeInputProps {
  label: string;
  hours: string;
  minutes: string;
  seconds: string;
  onChangeHours: (v: string) => void;
  onChangeMinutes: (v: string) => void;
  onChangeSeconds: (v: string) => void;
}

function TimeInput({
  label,
  hours,
  minutes,
  seconds,
  onChangeHours,
  onChangeMinutes,
  onChangeSeconds,
}: TimeInputProps) {
  return (
    <View style={styles.timeInputGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.timeRow}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={2}
            value={hours}
            onChangeText={onChangeHours}
            placeholder="HH"
            placeholderTextColor="#999"
          />
          <Text style={styles.inputLabel}>hrs</Text>
        </View>
        <Text style={styles.colon}>:</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={2}
            value={minutes}
            onChangeText={onChangeMinutes}
            placeholder="MM"
            placeholderTextColor="#999"
          />
          <Text style={styles.inputLabel}>min</Text>
        </View>
        <Text style={styles.colon}>:</Text>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            maxLength={2}
            value={seconds}
            onChangeText={onChangeSeconds}
            placeholder="SS"
            placeholderTextColor="#999"
          />
          <Text style={styles.inputLabel}>sec</Text>
        </View>
      </View>
    </View>
  );
}

interface HistoryEntry {
  id: string;
  h: number;
  m: number;
  s: number;
}

function priorityColor(p: TaskPriority): string {
  if (p === "High") return "#ff6b6b";
  if (p === "Medium") return "#f5a623";
  return "#4caf50";
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

function TaskListItem({ task, is24h, onDelete, onToggleDone, onPostpone, onEdit, onShare, selected, onLongPress }: TaskListItemProps) {
  const eventDate = new Date(task.event_date);
  const h = eventDate.getHours();
  const m = eventDate.getMinutes();
  const s = eventDate.getSeconds();
  const timeLabel = is24h ? formatTime24(h, m, s) : formatTime12(h, m, s);
  const isDone = task.status === "done";

  const recurrLabel =
    task.recurrence_type === "daily"
      ? "↻ Daily"
      : task.recurrence_type === "weekly"
      ? "↻ Weekly"
      : task.recurrence_type === "custom" && task.recurrence_interval != null
      ? `↻ Every ${task.recurrence_interval}d`
      : null;

  return (
    <TouchableOpacity
      onLongPress={() => onLongPress(task)}
      activeOpacity={0.8}
      style={[styles.taskItem, isDone && styles.taskItemDone, selected && styles.taskItemSelected]}
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
          {eventDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {timeLabel} · -{task.reminder_minutes} min reminder
        </Text>
        <View style={styles.taskBadgeRow}>
          {task.category && (
            <View style={styles.categoryBadge}>
              <Text style={styles.categoryBadgeText}>{task.category}</Text>
            </View>
          )}
          {task.priority && (
            <View style={[styles.priorityBadge, { borderColor: priorityColor(task.priority) }]}>
              <Text style={[styles.priorityBadgeText, { color: priorityColor(task.priority) }]}>
                {task.priority}
              </Text>
            </View>
          )}
          {recurrLabel && (
            <View style={styles.recurrBadge}>
              <Text style={styles.recurrBadgeText}>{recurrLabel}</Text>
            </View>
          )}
        </View>
        {task.notes ? (
          <Text style={styles.taskNotes} numberOfLines={2}>
            {task.notes}
          </Text>
        ) : null}
      </View>
      <View style={styles.taskActions}>
        <TouchableOpacity style={styles.taskShareButton} onPress={() => onShare(task)}>
          <Text style={styles.taskShareText}>↑</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.taskEditButton} onPress={() => onEdit(task)}>
          <Text style={styles.taskEditText}>✎</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.taskPostponeButton} onPress={() => onPostpone(task)}>
          <Text style={styles.taskPostponeText}>↻</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.taskDeleteButton} onPress={() => onDelete(task)}>
          <Text style={styles.taskDeleteText}>✕</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── Small inline time picker for excluded blocks / weighted ranges ────────────
function MiniTimePicker({
  label,
  seconds,
  onChange,
}: {
  label: string;
  seconds: number;
  onChange: (s: number) => void;
}) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);

  return (
    <View style={styles.miniTimeWrap}>
      <Text style={styles.miniTimeLabel}>{label}</Text>
      <View style={styles.miniTimeRow}>
        <TextInput
          style={styles.miniTimeInput}
          keyboardType="number-pad"
          maxLength={2}
          value={String(h).padStart(2, "0")}
          onChangeText={(v) => {
            const hh = clamp(parseInt(v, 10) || 0, 0, 23);
            onChange(hh * 3600 + m * 60);
          }}
        />
        <Text style={styles.miniTimeColon}>:</Text>
        <TextInput
          style={styles.miniTimeInput}
          keyboardType="number-pad"
          maxLength={2}
          value={String(m).padStart(2, "0")}
          onChangeText={(v) => {
            const mm = clamp(parseInt(v, 10) || 0, 0, 59);
            onChange(h * 3600 + mm * 60);
          }}
        />
      </View>
    </View>
  );
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export default function App() {
  const [minH, setMinH] = useState("00");
  const [minM, setMinM] = useState("00");
  const [minS, setMinS] = useState("00");

  const [maxH, setMaxH] = useState("23");
  const [maxM, setMaxM] = useState("59");
  const [maxS, setMaxS] = useState("59");

  const [results, setResults] = useState<{ h: number; m: number; s: number }[]>([]);
  const [generateCount, setGenerateCount] = useState<1 | 3 | 5>(1);
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [is24h, setIs24h] = useState(true);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "done">("all");
  const [sortBy, setSortBy] = useState<"time" | "priority" | "created">("time");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [dbReady, setDbReady] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [defaultReminder, setDefaultReminder] = useState("10");

  // Phase 7 — advanced generation
  const [weightedRanges, setWeightedRanges] = useState<WeightedRange[]>([]);
  const [excludedBlocks, setExcludedBlocks] = useState<ExcludedBlock[]>([]);
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [presetsVisible, setPresetsVisible] = useState(false);

  // Phase 9 — onboarding
  const [onboardingDone, setOnboardingDone] = useState<boolean | null>(null); // null = loading

  const isMountedRef = useRef(false);

  const loadTasks = useCallback(async () => {
    const fetched = await getTasks();
    setTasks(fetched);
  }, []);

  // Initialize DB and load persisted settings
  useEffect(() => {
    const init = async () => {
      await getDb();

      const saved24h = await getSetting("is24h");
      const savedMinH = await getSetting("min_h");
      const savedMinM = await getSetting("min_m");
      const savedMinS = await getSetting("min_s");
      const savedMaxH = await getSetting("max_h");
      const savedMaxM = await getSetting("max_m");
      const savedMaxS = await getSetting("max_s");
      const savedDefaultReminder = await getSetting("default_reminder");
      const savedOnboarding = await getSetting("onboarding_complete");
      const savedWeights = await getSetting("weighted_ranges");
      const savedExcluded = await getSetting("excluded_blocks");

      if (saved24h !== null) setIs24h(saved24h === "true");
      if (savedMinH !== null) setMinH(savedMinH);
      if (savedMinM !== null) setMinM(savedMinM);
      if (savedMinS !== null) setMinS(savedMinS);
      if (savedMaxH !== null) setMaxH(savedMaxH);
      if (savedMaxM !== null) setMaxM(savedMaxM);
      if (savedMaxS !== null) setMaxS(savedMaxS);
      if (savedDefaultReminder !== null) setDefaultReminder(savedDefaultReminder);
      if (savedWeights) {
        try { setWeightedRanges(JSON.parse(savedWeights)); } catch { /* ignore */ }
      }
      if (savedExcluded) {
        try { setExcludedBlocks(JSON.parse(savedExcluded)); } catch { /* ignore */ }
      }

      setOnboardingDone(savedOnboarding === "true");

      await loadTasks();

      isMountedRef.current = true;
      setDbReady(true);
    };

    init();
  }, [loadTasks]);

  // Notification action handlers (Done / Postpone / Snooze from tray)
  useEffect(() => {
    const cleanup = setupNotificationResponseHandler(
      async (taskId) => {
        await updateTaskStatus(taskId, "done");
        await loadTasks();
      },
      async (taskId) => {
        const task = (await getTasks()).find((t) => t.id === taskId);
        if (!task) return;
        const minTotal = hmsToSeconds(parseVal(minH, 23), parseVal(minM, 59), parseVal(minS, 59));
        const maxTotal = hmsToSeconds(parseVal(maxH, 23), parseVal(maxM, 59), parseVal(maxS, 59));
        const randomTotal = generateWeightedRandom(minTotal, maxTotal, weightedRanges, excludedBlocks);
        const { h, m, s } = secondsToHms(randomTotal);
        const orig = new Date(task.event_date);
        const newDate = new Date(orig.getFullYear(), orig.getMonth(), orig.getDate(), h, m, s);
        if (task.alarm_notification_id) await cancelNotification(task.alarm_notification_id);
        if (task.reminder_notification_id) await cancelNotification(task.reminder_notification_id);
        const { scheduleReminder, scheduleAlarm } = await import("./notificationService");
        const reminderId = await scheduleReminder(task.title, newDate, task.reminder_minutes);
        const alarmId = await scheduleAlarm(task.title, newDate, task.id);
        await updateTaskTime(task.id, newDate.toISOString(), alarmId, reminderId);
        await loadTasks();
      },
      async (taskId) => {
        // Snooze: reschedule alarm 15 min from now
        const task = (await getTasks()).find((t) => t.id === taskId);
        if (!task) return;
        if (task.alarm_notification_id) await cancelNotification(task.alarm_notification_id);
        const newAlarmId = await scheduleSnoozeAlarm(task.title, task.id);
        await updateTaskTime(task.id, task.event_date, newAlarmId, task.reminder_notification_id);
        await loadTasks();
      }
    );
    return cleanup;
  }, [loadTasks, minH, minM, minS, maxH, maxM, maxS, weightedRanges, excludedBlocks]);

  // Persist format toggle
  useEffect(() => {
    if (!isMountedRef.current) return;
    upsertSetting("is24h", String(is24h));
  }, [is24h]);

  // Persist min range
  useEffect(() => {
    if (!isMountedRef.current) return;
    upsertSetting("min_h", minH);
    upsertSetting("min_m", minM);
    upsertSetting("min_s", minS);
  }, [minH, minM, minS]);

  // Persist max range
  useEffect(() => {
    if (!isMountedRef.current) return;
    upsertSetting("max_h", maxH);
    upsertSetting("max_m", maxM);
    upsertSetting("max_s", maxS);
  }, [maxH, maxM, maxS]);

  // Persist default reminder
  useEffect(() => {
    if (!isMountedRef.current) return;
    upsertSetting("default_reminder", defaultReminder);
  }, [defaultReminder]);

  // Persist weighted ranges
  useEffect(() => {
    if (!isMountedRef.current) return;
    upsertSetting("weighted_ranges", JSON.stringify(weightedRanges));
  }, [weightedRanges]);

  // Persist excluded blocks
  useEffect(() => {
    if (!isMountedRef.current) return;
    upsertSetting("excluded_blocks", JSON.stringify(excludedBlocks));
  }, [excludedBlocks]);

  const parseVal = (v: string, max: number): number => {
    const n = parseInt(v, 10);
    if (isNaN(n)) return 0;
    return clamp(n, 0, max);
  };

  const formatResult = useCallback(
    (h: number, m: number, s: number) => {
      return is24h ? formatTime24(h, m, s) : formatTime12(h, m, s);
    },
    [is24h]
  );

  const generate = () => {
    const minHours = parseVal(minH, 23);
    const minMinutes = parseVal(minM, 59);
    const minSeconds = parseVal(minS, 59);
    const maxHours = parseVal(maxH, 23);
    const maxMinutes = parseVal(maxM, 59);
    const maxSeconds = parseVal(maxS, 59);

    const minTotal = hmsToSeconds(minHours, minMinutes, minSeconds);
    const maxTotal = hmsToSeconds(maxHours, maxMinutes, maxSeconds);

    if (minTotal > maxTotal) {
      setError("Min time must be less than or equal to max time");
      setResults([]);
      return;
    }

    setError(null);
    setCopied(false);
    setActiveResultIdx(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const generated: { h: number; m: number; s: number }[] = [];
    for (let i = 0; i < generateCount; i++) {
      const randomTotal = generateWeightedRandom(minTotal, maxTotal, weightedRanges, excludedBlocks);
      generated.push(secondsToHms(randomTotal));
    }
    setResults(generated);

    const entry: HistoryEntry = {
      id: Date.now().toString(),
      h: generated[0].h,
      m: generated[0].m,
      s: generated[0].s,
    };
    setHistory((prev) => [entry, ...prev].slice(0, MAX_HISTORY));
  };

  const copyToClipboard = async (idx: number) => {
    const r = results[idx];
    if (!r) return;
    const text = formatResult(r.h, r.m, r.s);
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleFormat = () => {
    setIs24h((prev) => !prev);
    setCopied(false);
  };

  const priorityRank = useCallback((p: string | null) => {
    if (p === "High") return 0;
    if (p === "Medium") return 1;
    return 2;
  }, []);

  const displayedTasks = useMemo(() => {
    let list = [...tasks];
    if (filterStatus !== "all") list = list.filter((t) => t.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => t.title.toLowerCase().includes(q));
    }
    if (sortBy === "priority") list.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
    else if (sortBy === "created") list.sort((a, b) => a.created_at.localeCompare(b.created_at));
    else list.sort((a, b) => a.event_date.localeCompare(b.event_date));
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
              if (task.alarm_notification_id) await cancelNotification(task.alarm_notification_id);
              if (task.reminder_notification_id) await cancelNotification(task.reminder_notification_id);
              if (task.reminder_notification_ids) {
                const ids: string[] = JSON.parse(task.reminder_notification_ids);
                for (const nid of ids) await cancelNotification(nid);
              }
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
              if (task.alarm_notification_id) await cancelNotification(task.alarm_notification_id);
              if (task.reminder_notification_id) await cancelNotification(task.reminder_notification_id);
              if (task.reminder_notification_ids) {
                const ids: string[] = JSON.parse(task.reminder_notification_ids);
                for (const id of ids) await cancelNotification(id);
              }
              await deleteTask(task.id);
            }
            await loadTasks();
          },
        },
      ]
    );
  }, [loadTasks]);

  const handleShareTask = useCallback((task: Task) => {
    const d = new Date(task.event_date);
    const dateStr = d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
    const h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
    const timeStr = is24h ? formatTime24(h, m, s) : formatTime12(h, m, s);
    const lines = [`📅 ${task.title}`, `🕐 ${dateStr} at ${timeStr}`];
    if (task.category) lines.push(`🏷 ${task.category}`);
    if (task.priority) lines.push(`⚡ Priority: ${task.priority}`);
    if (task.notes) lines.push(`📝 ${task.notes}`);
    Share.share({ message: lines.join("\n") });
  }, [is24h]);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task);
    setModalVisible(true);
  }, []);

  const handlePostpone = useCallback(
    async (task: Task) => {
      const minTotal = hmsToSeconds(parseVal(minH, 23), parseVal(minM, 59), parseVal(minS, 59));
      const maxTotal = hmsToSeconds(parseVal(maxH, 23), parseVal(maxM, 59), parseVal(maxS, 59));
      const randomTotal = generateWeightedRandom(minTotal, maxTotal, weightedRanges, excludedBlocks);
      const { h, m, s } = secondsToHms(randomTotal);

      const orig = new Date(task.event_date);
      const newDate = new Date(orig.getFullYear(), orig.getMonth(), orig.getDate(), h, m, s);

      if (task.alarm_notification_id) await cancelNotification(task.alarm_notification_id);
      if (task.reminder_notification_id) await cancelNotification(task.reminder_notification_id);
      if (task.reminder_notification_ids) {
        const ids: string[] = JSON.parse(task.reminder_notification_ids);
        for (const id of ids) await cancelNotification(id);
      }

      const { scheduleReminder, scheduleAlarm } = await import("./notificationService");
      const reminderId = await scheduleReminder(task.title, newDate, task.reminder_minutes);
      const alarmId = await scheduleAlarm(task.title, newDate);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await updateTaskTime(task.id, newDate.toISOString(), alarmId, reminderId);
      await loadTasks();
    },
    [minH, minM, minS, maxH, maxM, maxS, weightedRanges, excludedBlocks, loadTasks]
  );

  const handleToggleDone = useCallback(
    async (task: Task) => {
      const newStatus = task.status === "done" ? "pending" : "done";
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await updateTaskStatus(task.id, newStatus);
      await loadTasks();
    },
    [loadTasks]
  );

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
              if (task.alarm_notification_id) await cancelNotification(task.alarm_notification_id);
              if (task.reminder_notification_id) await cancelNotification(task.reminder_notification_id);
              if (task.reminder_notification_ids) {
                const ids: string[] = JSON.parse(task.reminder_notification_ids);
                for (const id of ids) await cancelNotification(id);
              }
              await deleteTask(task.id);
              await loadTasks();
            },
          },
        ]
      );
    },
    [loadTasks]
  );

  // ── Phase 7: Excluded block helpers ──────────────────────────────────────────
  const addExcludedBlock = () => {
    const block: ExcludedBlock = {
      id: generateId(),
      label: "Lunch",
      startSeconds: 12 * 3600,
      endSeconds: 13 * 3600,
    };
    setExcludedBlocks((prev) => [...prev, block]);
  };

  const updateExcludedBlock = (id: string, patch: Partial<ExcludedBlock>) => {
    setExcludedBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...patch } : b))
    );
  };

  const removeExcludedBlock = (id: string) => {
    setExcludedBlocks((prev) => prev.filter((b) => b.id !== id));
  };

  // ── Phase 7: Weighted range helpers ──────────────────────────────────────────
  const addWeightedRange = () => {
    const range: WeightedRange = {
      id: generateId(),
      label: "Work Hours",
      startSeconds: 9 * 3600,
      endSeconds: 17 * 3600,
      weight: 3,
    };
    setWeightedRanges((prev) => [...prev, range]);
  };

  const updateWeightedRange = (id: string, patch: Partial<WeightedRange>) => {
    setWeightedRanges((prev) =>
      prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const removeWeightedRange = (id: string) => {
    setWeightedRanges((prev) => prev.filter((r) => r.id !== id));
  };

  // ── Phase 7: Preset config snapshot ──────────────────────────────────────────
  const currentPresetConfig: PresetConfig = {
    minH, minM, minS,
    maxH, maxM, maxS,
    weights: weightedRanges,
    excluded: excludedBlocks,
  };

  const handleLoadPreset = (config: PresetConfig) => {
    setMinH(config.minH); setMinM(config.minM); setMinS(config.minS);
    setMaxH(config.maxH); setMaxM(config.maxM); setMaxS(config.maxS);
    setWeightedRanges(config.weights ?? []);
    setExcludedBlocks(config.excluded ?? []);
  };

  // ── Phase 9: Onboarding ───────────────────────────────────────────────────────
  const handleOnboardingComplete = useCallback(async () => {
    await upsertSetting("onboarding_complete", "true");
    setOnboardingDone(true);
  }, []);

  // Loading state — wait for DB init
  if (onboardingDone === null) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.container} />
      </SafeAreaProvider>
    );
  }

  // Onboarding gate
  if (!onboardingDone) {
    return (
      <SafeAreaProvider>
        <OnboardingScreen onComplete={handleOnboardingComplete} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.title}>Random Time</Text>
          <Text style={styles.subtitle}>Generator</Text>

          {/* Settings Panel */}
          <TouchableOpacity
            style={styles.settingsToggle}
            onPress={() => setSettingsVisible((v) => !v)}
          >
            <Text style={styles.settingsToggleText}>
              {settingsVisible ? "▲ Settings" : "▼ Settings"}
            </Text>
          </TouchableOpacity>
          {settingsVisible && (
            <View style={styles.settingsPanel}>
              <Text style={styles.settingsSectionLabel}>Default Reminder (minutes)</Text>
              <TextInput
                style={styles.settingsInput}
                keyboardType="number-pad"
                maxLength={3}
                value={defaultReminder}
                onChangeText={setDefaultReminder}
                placeholderTextColor="#666680"
                placeholder="10"
              />
              <TouchableOpacity
                style={styles.settingsDangerButton}
                onPress={handleDeleteAllDone}
              >
                <Text style={styles.settingsDangerText}>Delete all done tasks</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Format Toggle */}
          <TouchableOpacity style={styles.toggleRow} onPress={toggleFormat}>
            <Text style={[styles.toggleOption, is24h && styles.toggleActive]}>24H</Text>
            <View style={styles.toggleTrack}>
              <View style={[styles.toggleThumb, !is24h && styles.toggleThumbRight]} />
            </View>
            <Text style={[styles.toggleOption, !is24h && styles.toggleActive]}>12H</Text>
          </TouchableOpacity>

          {/* Range Card */}
          <View style={styles.card}>
            <TimeInput
              label="From"
              hours={minH} minutes={minM} seconds={minS}
              onChangeHours={setMinH} onChangeMinutes={setMinM} onChangeSeconds={setMinS}
            />
            <View style={styles.divider} />
            <TimeInput
              label="To"
              hours={maxH} minutes={maxM} seconds={maxS}
              onChangeHours={setMaxH} onChangeMinutes={setMaxM} onChangeSeconds={setMaxS}
            />
          </View>

          {/* ── Phase 7: Advanced generation panel ─────────────────────── */}
          <TouchableOpacity
            style={styles.advancedToggle}
            onPress={() => setAdvancedVisible((v) => !v)}
          >
            <Text style={styles.advancedToggleText}>
              {advancedVisible ? "▲ Advanced" : "▼ Advanced"}
              {(weightedRanges.length > 0 || excludedBlocks.length > 0) ? "  ●" : ""}
            </Text>
          </TouchableOpacity>

          {advancedVisible && (
            <View style={styles.advancedPanel}>
              {/* Presets */}
              <TouchableOpacity
                style={styles.presetsButton}
                onPress={() => setPresetsVisible(true)}
              >
                <Text style={styles.presetsButtonText}>⚙ Manage Presets</Text>
              </TouchableOpacity>

              {/* Excluded Blocks */}
              <Text style={styles.advancedSectionLabel}>Excluded Time Blocks</Text>
              <Text style={styles.advancedHint}>Times falling in these blocks are skipped.</Text>
              {excludedBlocks.map((block) => (
                <View key={block.id} style={styles.blockRow}>
                  <TextInput
                    style={styles.blockLabelInput}
                    value={block.label}
                    onChangeText={(v) => updateExcludedBlock(block.id, { label: v })}
                    placeholder="Label"
                    placeholderTextColor="#666680"
                  />
                  <MiniTimePicker
                    label="From"
                    seconds={block.startSeconds}
                    onChange={(s) => updateExcludedBlock(block.id, { startSeconds: s })}
                  />
                  <MiniTimePicker
                    label="To"
                    seconds={block.endSeconds}
                    onChange={(s) => updateExcludedBlock(block.id, { endSeconds: s })}
                  />
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeExcludedBlock(block.id)}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addButton} onPress={addExcludedBlock}>
                <Text style={styles.addButtonText}>+ Add Block</Text>
              </TouchableOpacity>

              {/* Weighted Ranges */}
              <Text style={[styles.advancedSectionLabel, { marginTop: 16 }]}>Weighted Ranges</Text>
              <Text style={styles.advancedHint}>Higher weight = more likely to generate in that range.</Text>
              {weightedRanges.map((range) => (
                <View key={range.id} style={styles.blockRow}>
                  <TextInput
                    style={styles.blockLabelInput}
                    value={range.label}
                    onChangeText={(v) => updateWeightedRange(range.id, { label: v })}
                    placeholder="Label"
                    placeholderTextColor="#666680"
                  />
                  <MiniTimePicker
                    label="From"
                    seconds={range.startSeconds}
                    onChange={(s) => updateWeightedRange(range.id, { startSeconds: s })}
                  />
                  <MiniTimePicker
                    label="To"
                    seconds={range.endSeconds}
                    onChange={(s) => updateWeightedRange(range.id, { endSeconds: s })}
                  />
                  <View style={styles.weightWrap}>
                    <Text style={styles.weightLabel}>×</Text>
                    <TextInput
                      style={styles.weightInput}
                      keyboardType="number-pad"
                      maxLength={2}
                      value={String(range.weight)}
                      onChangeText={(v) =>
                        updateWeightedRange(range.id, { weight: Math.max(1, parseInt(v, 10) || 1) })
                      }
                    />
                  </View>
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeWeightedRange(range.id)}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={styles.addButton} onPress={addWeightedRange}>
                <Text style={styles.addButtonText}>+ Add Range</Text>
              </TouchableOpacity>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          {/* Count selector + Generate */}
          <View style={styles.generateRow}>
            {([1, 3, 5] as const).map((n) => (
              <TouchableOpacity
                key={n}
                style={[styles.countChip, generateCount === n && styles.countChipActive]}
                onPress={() => setGenerateCount(n)}
              >
                <Text style={[styles.countChipText, generateCount === n && styles.countChipTextActive]}>
                  ×{n}
                </Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity style={[styles.button, styles.buttonFlex]} onPress={generate}>
              <Text style={styles.buttonText}>Generate</Text>
            </TouchableOpacity>
          </View>

          {/* Results */}
          {results.map((r, idx) => (
            <View key={idx} style={styles.resultContainer}>
              <Text style={styles.resultLabel}>
                {results.length > 1 ? `Time ${idx + 1}` : "Your random time"}
              </Text>
              <Text style={styles.result}>{formatResult(r.h, r.m, r.s)}</Text>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.copyButton} onPress={() => copyToClipboard(idx)}>
                  <Text style={styles.copyButtonText}>
                    {copied && activeResultIdx === idx ? "Copied!" : "Copy"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.calendarButton}
                  onPress={() => {
                    setActiveResultIdx(idx);
                    setEditingTask(undefined);
                    setModalVisible(true);
                  }}
                >
                  <Text style={styles.calendarButtonText}>Add to Calendar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Add Event Modal */}
          <AddEventModal
            visible={modalVisible}
            eventHour={results[activeResultIdx]?.h ?? 0}
            eventMinute={results[activeResultIdx]?.m ?? 0}
            eventSecond={results[activeResultIdx]?.s ?? 0}
            onClose={() => { setModalVisible(false); setEditingTask(undefined); }}
            onTaskSaved={loadTasks}
            editTask={editingTask}
            defaultReminderMin={parseInt(defaultReminder, 10) || 10}
            existingTasks={tasks}
          />

          {/* Presets Modal */}
          <PresetsModal
            visible={presetsVisible}
            onClose={() => setPresetsVisible(false)}
            currentConfig={currentPresetConfig}
            onLoadPreset={handleLoadPreset}
          />

          {/* History */}
          {history.length > 0 && (
            <View style={styles.historyContainer}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>History</Text>
                <TouchableOpacity onPress={() => setHistory([])}>
                  <Text style={styles.clearText}>Clear</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={history}
                scrollEnabled={false}
                keyExtractor={(item) => item.id}
                renderItem={({ item, index }) => (
                  <View style={[styles.historyItem, index === 0 && styles.historyItemLatest]}>
                    <Text style={styles.historyIndex}>#{index + 1}</Text>
                    <Text style={[styles.historyTime, index === 0 && styles.historyTimeLatest]}>
                      {formatResult(item.h, item.m, item.s)}
                    </Text>
                  </View>
                )}
              />
            </View>
          )}

          {/* Saved Tasks */}
          {dbReady && tasks.length > 0 && (
            <View style={styles.taskListContainer}>
              <View style={styles.taskListHeader}>
                <Text style={styles.taskListTitle}>Saved Tasks</Text>
                {selectedIds.size > 0 && (
                  <TouchableOpacity style={styles.bulkDeleteButton} onPress={handleBulkDelete}>
                    <Text style={styles.bulkDeleteText}>Delete {selectedIds.size}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                style={styles.searchInput}
                placeholder="Search tasks…"
                placeholderTextColor="#666680"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />

              <View style={styles.filterRow}>
                {(["all", "pending", "done"] as const).map((f) => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.filterChip, filterStatus === f && styles.filterChipActive]}
                    onPress={() => setFilterStatus(f)}
                  >
                    <Text style={[styles.filterChipText, filterStatus === f && styles.filterChipTextActive]}>
                      {f === "all" ? "All" : f === "pending" ? "Pending" : "Done"}
                    </Text>
                  </TouchableOpacity>
                ))}
                <View style={styles.filterSpacer} />
                {(["time", "priority", "created"] as const).map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.sortChip, sortBy === s && styles.sortChipActive]}
                    onPress={() => setSortBy(s)}
                  >
                    <Text style={[styles.sortChipText, sortBy === s && styles.sortChipTextActive]}>
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
                  onDelete={handleDeleteTask}
                  onToggleDone={handleToggleDone}
                  onPostpone={handlePostpone}
                  onEdit={handleEditTask}
                  onShare={handleShareTask}
                  selected={selectedIds.has(task.id)}
                  onLongPress={handleLongPress}
                />
              ))}
              {displayedTasks.length === 0 && (
                <Text style={styles.emptyText}>No tasks match.</Text>
              )}
            </View>
          )}

          {/* Statistics */}
          {dbReady && tasks.length > 0 && (
            <View style={styles.statsContainer}>
              <Text style={styles.statsTitle}>Statistics</Text>
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{tasks.length}</Text>
                  <Text style={styles.statLabel}>Total</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: "#6c63ff" }]}>
                    {tasks.filter((t) => t.status === "done").length}
                  </Text>
                  <Text style={styles.statLabel}>Done</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={[styles.statValue, { color: "#4caf50" }]}>
                    {tasks.length > 0
                      ? Math.round((tasks.filter((t) => t.status === "done").length / tasks.length) * 100)
                      : 0}%
                  </Text>
                  <Text style={styles.statLabel}>Complete</Text>
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f1a",
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 60,
    paddingBottom: 40,
    alignItems: "center",
  },
  title: {
    fontSize: 36,
    fontWeight: "800",
    color: "#ffffff",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 36,
    fontWeight: "800",
    color: "#6c63ff",
    textAlign: "center",
    marginBottom: 24,
  },

  // Format toggle
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  toggleOption: {
    fontSize: 14,
    fontWeight: "700",
    color: "#555570",
  },
  toggleActive: {
    color: "#6c63ff",
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#2a2a40",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#6c63ff",
    alignSelf: "flex-start",
  },
  toggleThumbRight: {
    alignSelf: "flex-end",
  },

  // Settings
  settingsToggle: {
    marginBottom: 8,
    paddingVertical: 6,
  },
  settingsToggleText: {
    color: "#6c63ff",
    fontSize: 14,
    fontWeight: "700",
  },
  settingsPanel: {
    width: "100%",
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 12,
  },
  settingsSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  settingsInput: {
    backgroundColor: "#2a2a40",
    color: "#ffffff",
    fontSize: 16,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#3a3a55",
    width: 100,
  },
  settingsDangerButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ff6b6b33",
    backgroundColor: "#ff6b6b11",
    alignSelf: "flex-start",
  },
  settingsDangerText: {
    color: "#ff6b6b",
    fontWeight: "600",
    fontSize: 13,
  },

  // Range card
  card: {
    width: "100%",
    backgroundColor: "#1a1a2e",
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    gap: 16,
  },
  timeInputGroup: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  inputWrapper: {
    alignItems: "center",
    gap: 4,
  },
  input: {
    width: 58,
    backgroundColor: "#2a2a40",
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "700",
    textAlign: "center",
    borderRadius: 12,
    padding: 10,
    borderWidth: 2,
    borderColor: "#3a3a55",
  },
  inputLabel: {
    fontSize: 11,
    color: "#555570",
    fontWeight: "600",
  },
  colon: {
    fontSize: 24,
    fontWeight: "800",
    color: "#3a3a55",
    marginBottom: 12,
  },
  divider: {
    height: 1,
    backgroundColor: "#2a2a40",
    marginVertical: 4,
  },

  // Advanced panel (Phase 7)
  advancedToggle: {
    marginBottom: 6,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  advancedToggleText: {
    color: "#8888aa",
    fontSize: 13,
    fontWeight: "700",
  },
  advancedPanel: {
    width: "100%",
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    gap: 8,
  },
  presetsButton: {
    backgroundColor: "#2a2a40",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#3a3a55",
    marginBottom: 4,
  },
  presetsButtonText: {
    color: "#6c63ff",
    fontWeight: "700",
    fontSize: 13,
  },
  advancedSectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 4,
  },
  advancedHint: {
    fontSize: 11,
    color: "#555570",
    marginBottom: 4,
  },
  blockRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
    backgroundColor: "#2a2a40",
    borderRadius: 12,
    padding: 10,
  },
  blockLabelInput: {
    flex: 1,
    minWidth: 70,
    backgroundColor: "#1a1a2e",
    color: "#ffffff",
    fontSize: 13,
    borderRadius: 8,
    padding: 6,
    borderWidth: 1,
    borderColor: "#3a3a55",
  },
  removeButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  removeButtonText: {
    color: "#ff6b6b",
    fontWeight: "700",
    fontSize: 14,
  },
  addButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#3a3a55",
    alignSelf: "flex-start",
  },
  addButtonText: {
    color: "#6c63ff",
    fontWeight: "700",
    fontSize: 13,
  },

  // Mini time picker
  miniTimeWrap: {
    alignItems: "center",
    gap: 2,
  },
  miniTimeLabel: {
    fontSize: 10,
    color: "#666680",
    fontWeight: "600",
  },
  miniTimeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  miniTimeInput: {
    width: 36,
    backgroundColor: "#1a1a2e",
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    borderRadius: 6,
    padding: 4,
    borderWidth: 1,
    borderColor: "#3a3a55",
  },
  miniTimeColon: {
    color: "#555570",
    fontWeight: "800",
    fontSize: 14,
  },

  // Weighted range weight input
  weightWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  weightLabel: {
    color: "#8888aa",
    fontWeight: "700",
    fontSize: 14,
  },
  weightInput: {
    width: 36,
    backgroundColor: "#1a1a2e",
    color: "#6c63ff",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    borderRadius: 6,
    padding: 4,
    borderWidth: 1,
    borderColor: "#6c63ff44",
  },

  // Error
  error: {
    color: "#ff6b6b",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 12,
  },

  // Generate row
  generateRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    marginBottom: 16,
  },
  countChip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#3a3a55",
    justifyContent: "center",
  },
  countChipActive: {
    backgroundColor: "#2a2a40",
    borderColor: "#6c63ff",
  },
  countChipText: {
    color: "#555570",
    fontWeight: "700",
    fontSize: 14,
  },
  countChipTextActive: {
    color: "#6c63ff",
  },
  button: {
    backgroundColor: "#6c63ff",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: "center",
  },
  buttonFlex: {
    flex: 1,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "700",
  },

  // Results
  resultContainer: {
    width: "100%",
    backgroundColor: "#1a1a2e",
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    marginBottom: 12,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#555570",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  result: {
    fontSize: 52,
    fontWeight: "800",
    color: "#ffffff",
    letterSpacing: 2,
    marginBottom: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
  },
  copyButton: {
    backgroundColor: "#2a2a40",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  copyButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },
  calendarButton: {
    backgroundColor: "#6c63ff",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  calendarButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 14,
  },

  // History
  historyContainer: {
    width: "100%",
    marginTop: 8,
    marginBottom: 16,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  historyTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
  },
  clearText: {
    fontSize: 13,
    color: "#6c63ff",
    fontWeight: "600",
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: "#1a1a2e",
    marginBottom: 6,
    gap: 12,
  },
  historyItemLatest: {
    borderWidth: 1,
    borderColor: "#6c63ff44",
  },
  historyIndex: {
    fontSize: 12,
    color: "#555570",
    fontWeight: "600",
    width: 28,
  },
  historyTime: {
    fontSize: 16,
    fontWeight: "700",
    color: "#aaaacc",
    fontVariant: ["tabular-nums"],
  },
  historyTimeLatest: {
    color: "#ffffff",
  },

  // Task list
  taskListContainer: {
    width: "100%",
    marginTop: 8,
    marginBottom: 16,
  },
  taskListHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  taskListTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#ffffff",
  },
  bulkDeleteButton: {
    backgroundColor: "#ff6b6b22",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#ff6b6b44",
  },
  bulkDeleteText: {
    color: "#ff6b6b",
    fontWeight: "700",
    fontSize: 13,
  },
  searchInput: {
    backgroundColor: "#1a1a2e",
    color: "#ffffff",
    fontSize: 14,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#2a2a40",
    marginBottom: 12,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
    flexWrap: "wrap",
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#2a2a40",
  },
  filterChipActive: {
    backgroundColor: "#2a2a40",
    borderColor: "#6c63ff",
  },
  filterChipText: {
    color: "#555570",
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#6c63ff",
  },
  filterSpacer: {
    flex: 1,
  },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#2a2a40",
  },
  sortChipActive: {
    backgroundColor: "#2a2a40",
    borderColor: "#6c63ff",
  },
  sortChipText: {
    color: "#555570",
    fontSize: 12,
    fontWeight: "600",
  },
  sortChipTextActive: {
    color: "#6c63ff",
  },
  taskItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    backgroundColor: "#1a1a2e",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 10,
    borderWidth: 1,
    borderColor: "#2a2a40",
  },
  taskItemDone: {
    opacity: 0.55,
  },
  taskItemSelected: {
    borderColor: "#6c63ff",
    backgroundColor: "#1a1a3e",
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#3a3a55",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  checkboxDone: {
    backgroundColor: "#6c63ff",
    borderColor: "#6c63ff",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  taskInfo: {
    flex: 1,
    gap: 4,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
  },
  taskTitleDone: {
    textDecorationLine: "line-through",
    color: "#666680",
  },
  taskMeta: {
    fontSize: 12,
    color: "#666680",
  },
  taskBadgeRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  categoryBadge: {
    backgroundColor: "#2a2a40",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  categoryBadgeText: {
    fontSize: 11,
    color: "#aaaacc",
    fontWeight: "600",
  },
  priorityBadge: {
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
  },
  priorityBadgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  recurrBadge: {
    backgroundColor: "#6c63ff22",
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: "#6c63ff44",
  },
  recurrBadgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#6c63ff",
  },
  taskNotes: {
    fontSize: 12,
    color: "#555570",
    fontStyle: "italic",
    marginTop: 2,
  },
  taskActions: {
    flexDirection: "column",
    gap: 4,
  },
  taskShareButton: {
    padding: 6,
  },
  taskShareText: {
    color: "#8888aa",
    fontSize: 16,
  },
  taskEditButton: {
    padding: 6,
  },
  taskEditText: {
    color: "#8888aa",
    fontSize: 16,
  },
  taskPostponeButton: {
    padding: 6,
  },
  taskPostponeText: {
    color: "#f5a623",
    fontSize: 16,
  },
  taskDeleteButton: {
    padding: 6,
  },
  taskDeleteText: {
    color: "#ff6b6b",
    fontSize: 16,
  },
  emptyText: {
    color: "#555570",
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
  },

  // Stats
  statsContainer: {
    width: "100%",
    backgroundColor: "#1a1a2e",
    borderRadius: 16,
    padding: 16,
    marginTop: 4,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  statCard: {
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: "800",
    color: "#ffffff",
  },
  statLabel: {
    fontSize: 12,
    color: "#666680",
    fontWeight: "600",
  },
});
