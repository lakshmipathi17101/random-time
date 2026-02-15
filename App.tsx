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
import {
  getDb,
  getTasks,
  deleteTask,
  updateTaskStatus,
  updateTaskTime,
  getSetting,
  upsertSetting,
  Task,
  TaskPriority,
} from "./db";
import { cancelNotification } from "./notificationService";

const MAX_HISTORY = 10;

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function timeToSeconds(h: number, m: number, s: number): number {
  return h * 3600 + m * 60 + s;
}

function secondsToTime(totalSeconds: number): {
  h: number;
  m: number;
  s: number;
} {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h, m, s };
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
        {(task.category || task.priority) && (
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

      if (saved24h !== null) setIs24h(saved24h === "true");
      if (savedMinH !== null) setMinH(savedMinH);
      if (savedMinM !== null) setMinM(savedMinM);
      if (savedMinS !== null) setMinS(savedMinS);
      if (savedMaxH !== null) setMaxH(savedMaxH);
      if (savedMaxM !== null) setMaxM(savedMaxM);
      if (savedMaxS !== null) setMaxS(savedMaxS);

      await loadTasks();

      isMountedRef.current = true;
      setDbReady(true);
    };

    init();
  }, [loadTasks]);

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

    const minTotal = timeToSeconds(minHours, minMinutes, minSeconds);
    const maxTotal = timeToSeconds(maxHours, maxMinutes, maxSeconds);

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
      const randomTotal =
        Math.floor(Math.random() * (maxTotal - minTotal + 1)) + minTotal;
      generated.push(secondsToTime(randomTotal));
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
      const minTotal = timeToSeconds(
        parseVal(minH, 23), parseVal(minM, 59), parseVal(minS, 59)
      );
      const maxTotal = timeToSeconds(
        parseVal(maxH, 23), parseVal(maxM, 59), parseVal(maxS, 59)
      );
      const range = Math.max(maxTotal - minTotal, 0);
      const randomTotal = Math.floor(Math.random() * (range + 1)) + minTotal;
      const { h, m, s } = secondsToTime(randomTotal);

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
    [minH, minM, minS, maxH, maxM, maxS, loadTasks]
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

          {/* Format Toggle */}
          <TouchableOpacity style={styles.toggleRow} onPress={toggleFormat}>
            <Text style={[styles.toggleOption, is24h && styles.toggleActive]}>
              24H
            </Text>
            <View style={styles.toggleTrack}>
              <View
                style={[
                  styles.toggleThumb,
                  !is24h && styles.toggleThumbRight,
                ]}
              />
            </View>
            <Text style={[styles.toggleOption, !is24h && styles.toggleActive]}>
              12H
            </Text>
          </TouchableOpacity>

          {/* Range Card */}
          <View style={styles.card}>
            <TimeInput
              label="From"
              hours={minH}
              minutes={minM}
              seconds={minS}
              onChangeHours={setMinH}
              onChangeMinutes={setMinM}
              onChangeSeconds={setMinS}
            />

            <View style={styles.divider} />

            <TimeInput
              label="To"
              hours={maxH}
              minutes={maxM}
              seconds={maxS}
              onChangeHours={setMaxH}
              onChangeMinutes={setMaxM}
              onChangeSeconds={setMaxS}
            />
          </View>

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
                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={() => copyToClipboard(idx)}
                >
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
                  <View
                    style={[
                      styles.historyItem,
                      index === 0 && styles.historyItemLatest,
                    ]}
                  >
                    <Text style={styles.historyIndex}>#{index + 1}</Text>
                    <Text
                      style={[
                        styles.historyTime,
                        index === 0 && styles.historyTimeLatest,
                      ]}
                    >
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
              {/* Header */}
              <View style={styles.taskListHeader}>
                <Text style={styles.taskListTitle}>Saved Tasks</Text>
                {selectedIds.size > 0 && (
                  <TouchableOpacity
                    style={styles.bulkDeleteButton}
                    onPress={handleBulkDelete}
                  >
                    <Text style={styles.bulkDeleteText}>
                      Delete {selectedIds.size}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Search */}
              <TextInput
                style={styles.searchInput}
                placeholder="Search tasks…"
                placeholderTextColor="#666680"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />

              {/* Filter chips */}
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
  },
  toggleThumbRight: {
    alignSelf: "flex-end",
  },

  // Card
  card: {
    backgroundColor: "#1a1a2e",
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  timeInputGroup: {
    marginVertical: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  inputWrapper: {
    alignItems: "center",
  },
  input: {
    backgroundColor: "#2a2a40",
    color: "#ffffff",
    fontSize: 28,
    fontWeight: "700",
    textAlign: "center",
    width: 70,
    height: 56,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#3a3a55",
  },
  inputLabel: {
    fontSize: 11,
    color: "#666680",
    marginTop: 4,
  },
  colon: {
    fontSize: 28,
    fontWeight: "700",
    color: "#6c63ff",
    marginHorizontal: 6,
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: "#2a2a40",
    marginVertical: 16,
  },
  error: {
    color: "#ff6b6b",
    fontSize: 14,
    marginTop: 16,
    textAlign: "center",
  },

  generateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 28,
    width: "100%",
    maxWidth: 400,
  },
  countChip: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#3a3a55",
    alignItems: "center",
    justifyContent: "center",
  },
  countChipActive: {
    backgroundColor: "#6c63ff33",
    borderColor: "#6c63ff",
  },
  countChipText: {
    color: "#8888aa",
    fontSize: 15,
    fontWeight: "700",
  },
  countChipTextActive: {
    color: "#6c63ff",
  },
  buttonFlex: {
    flex: 1,
    marginTop: 0,
  },
  // Generate button
  button: {
    backgroundColor: "#6c63ff",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    marginTop: 28,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    shadowColor: "#6c63ff",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "700",
  },

  // Result
  resultContainer: {
    marginTop: 32,
    alignItems: "center",
  },
  resultLabel: {
    fontSize: 14,
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  result: {
    fontSize: 48,
    fontWeight: "800",
    color: "#6c63ff",
    letterSpacing: 3,
  },
  actionRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 12,
  },
  copyButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6c63ff",
  },
  copyButtonText: {
    color: "#6c63ff",
    fontSize: 14,
    fontWeight: "600",
  },
  calendarButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: "#6c63ff",
  },
  calendarButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "600",
  },

  // History
  historyContainer: {
    marginTop: 32,
    width: "100%",
    maxWidth: 400,
  },
  historyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  clearText: {
    fontSize: 13,
    color: "#ff6b6b",
    fontWeight: "600",
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  historyItemLatest: {
    borderWidth: 1,
    borderColor: "#6c63ff33",
  },
  historyIndex: {
    fontSize: 13,
    color: "#555570",
    fontWeight: "600",
    width: 32,
  },
  historyTime: {
    fontSize: 18,
    fontWeight: "700",
    color: "#aaaacc",
    letterSpacing: 2,
  },
  historyTimeLatest: {
    color: "#6c63ff",
  },

  // Saved Tasks
  taskListContainer: {
    marginTop: 32,
    width: "100%",
    maxWidth: 400,
  },
  taskListTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  taskItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: 4,
  },
  taskMeta: {
    fontSize: 12,
    color: "#8888aa",
    letterSpacing: 0.5,
  },
  taskDeleteButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#ff6b6b44",
    alignItems: "center",
    justifyContent: "center",
  },
  taskDeleteText: {
    color: "#ff6b6b",
    fontSize: 14,
    fontWeight: "700",
  },
  taskItemDone: {
    opacity: 0.6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#3a3a55",
    marginRight: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxDone: {
    backgroundColor: "#6c63ff",
    borderColor: "#6c63ff",
  },
  checkmark: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "700",
  },
  taskTitleDone: {
    textDecorationLine: "line-through",
    color: "#666680",
  },
  taskNotes: {
    fontSize: 12,
    color: "#666680",
    marginTop: 4,
    fontStyle: "italic",
  },
  taskItemSelected: {
    borderWidth: 1,
    borderColor: "#6c63ff",
    backgroundColor: "#1f1f35",
  },
  taskListHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  bulkDeleteButton: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#ff6b6b22",
    borderWidth: 1,
    borderColor: "#ff6b6b44",
  },
  bulkDeleteText: {
    color: "#ff6b6b",
    fontSize: 12,
    fontWeight: "700",
  },
  searchInput: {
    backgroundColor: "#1a1a2e",
    color: "#ffffff",
    fontSize: 14,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#3a3a55",
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
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#3a3a55",
  },
  filterChipActive: {
    backgroundColor: "#6c63ff22",
    borderColor: "#6c63ff",
  },
  filterChipText: {
    fontSize: 12,
    color: "#8888aa",
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#6c63ff",
  },
  filterSpacer: {
    flex: 1,
  },
  sortChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#1a1a2e",
    borderWidth: 1,
    borderColor: "#3a3a55",
  },
  sortChipActive: {
    backgroundColor: "#2a2a40",
    borderColor: "#8888aa",
  },
  sortChipText: {
    fontSize: 11,
    color: "#555570",
    fontWeight: "600",
  },
  sortChipTextActive: {
    color: "#aaaacc",
  },
  emptyText: {
    color: "#555570",
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
  },
  statsContainer: {
    marginTop: 32,
    width: "100%",
    maxWidth: 400,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#8888aa",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: "#ffffff",
  },
  statLabel: {
    fontSize: 11,
    color: "#8888aa",
    fontWeight: "600",
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  taskActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  taskBadgeRow: {
    flexDirection: "row",
    gap: 6,
    marginTop: 6,
    flexWrap: "wrap",
  },
  categoryBadge: {
    backgroundColor: "#2a2a40",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  categoryBadgeText: {
    fontSize: 11,
    color: "#8888aa",
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
  taskShareButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#4caf5044",
    alignItems: "center",
    justifyContent: "center",
  },
  taskShareText: {
    color: "#4caf50",
    fontSize: 15,
    fontWeight: "700",
  },
  taskEditButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#8888aa44",
    alignItems: "center",
    justifyContent: "center",
  },
  taskEditText: {
    color: "#8888aa",
    fontSize: 15,
    fontWeight: "700",
  },
  taskPostponeButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6c63ff44",
    alignItems: "center",
    justifyContent: "center",
  },
  taskPostponeText: {
    color: "#6c63ff",
    fontSize: 16,
    fontWeight: "700",
  },
});
