import { useState, useCallback, useEffect, useRef, useMemo, createContext, useContext } from "react";
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
  getDoneTasks,
  deleteTask,
  updateTaskStatus,
  updateTaskTime,
  getSetting,
  upsertSetting,
  purgeOldCompletions,
  Task,
  TaskPriority,
  TaskCategory,
} from "./db";
import {
  cancelTaskNotifications,
  setupNotificationResponseHandler,
  scheduleReminder,
  scheduleAlarm,
  scheduleGentleNudge,
  setupOverlayAlarmResponseHandler,
} from "./notificationService";
import { DARK, LIGHT, AppTheme } from "./theme";
import {
  generateWeightedRandom,
  buildBiasConfig,
  BiasFlags,
} from "./weightedRandom";
import { calcStreakWithGrace } from "./utils/streak";
import {
  planSurpriseMe,
  nudgeCountForEnergy,
  nextOccurrence,
  type EnergyLevel,
} from "./utils/scheduler";
import {
  generateRandomDuration,
  formatDuration,
  validateDurationBounds,
} from "./utils/duration";
import { useAppControl } from "./hooks/useAppControl";
import ProgressDashboard from "./ProgressDashboard";

// ─── Theme context ────────────────────────────────────────────────────────────
const ThemeContext = createContext<AppTheme>(DARK);
function useAppTheme(): AppTheme {
  return useContext(ThemeContext);
}

// ─── Utilities ────────────────────────────────────────────────────────────────
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

function secondsToTime(totalSeconds: number): { h: number; m: number; s: number } {
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

/**
 * Local-time 'YYYY-MM-DD' day key.
 *
 * `toISOString().slice(0, 10)` yields the *UTC* day, which rolls over at the
 * wrong local hour in any non-UTC timezone — e.g. at UTC+5:30 every local time
 * before 05:30 still reports yesterday's date. Matches the convention already
 * used by ProgressDashboard's toDateStr.
 */
function localDateKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Phase 10 — streak with a one-grace-per-7-days forgiveness rule.
 * Delegates to utils/streak.ts; returns both the count and whether a grace
 * was consumed so the UI can show a "streak saved" note.
 */
function computeStreak(tasks: Task[]): { streak: number; graceUsed: boolean } {
  const doneDates = new Set(
    tasks
      .filter((t) => t.status === "done")
      .map((t) => {
        const d = new Date(t.event_date);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
  );
  return calcStreakWithGrace(doneDates);
}

// ─── TimeInput ────────────────────────────────────────────────────────────────
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
  const t = useAppTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  return (
    <View style={s.timeInputGroup}>
      <Text style={s.label}>{label}</Text>
      <View style={s.timeRow}>
        <View style={s.inputWrapper}>
          <TextInput
            style={s.input}
            keyboardType="number-pad"
            maxLength={2}
            value={hours}
            onChangeText={onChangeHours}
            placeholder="HH"
            placeholderTextColor={t.textDim}
          />
          <Text style={s.inputLabel}>hrs</Text>
        </View>
        <Text style={s.colon}>:</Text>
        <View style={s.inputWrapper}>
          <TextInput
            style={s.input}
            keyboardType="number-pad"
            maxLength={2}
            value={minutes}
            onChangeText={onChangeMinutes}
            placeholder="MM"
            placeholderTextColor={t.textDim}
          />
          <Text style={s.inputLabel}>min</Text>
        </View>
        <Text style={s.colon}>:</Text>
        <View style={s.inputWrapper}>
          <TextInput
            style={s.input}
            keyboardType="number-pad"
            maxLength={2}
            value={seconds}
            onChangeText={onChangeSeconds}
            placeholder="SS"
            placeholderTextColor={t.textDim}
          />
          <Text style={s.inputLabel}>sec</Text>
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

/**
 * Phase 10 — human-readable countdown for the Next Nudge card.
 * < 1 min → "30 sec"; < 1 hr → "14 min"; otherwise "2h 14m".
 */
function formatCountdown(seconds: number): string {
  if (seconds <= 0) return "now";
  if (seconds < 60) return `${seconds} sec`;
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const hrs = Math.floor(mins / 60);
  const remM = mins % 60;
  return `${hrs}h ${remM}m`;
}

function priorityColor(p: TaskPriority): string {
  if (p === "High") return "#ff6b6b";
  if (p === "Medium") return "#f5a623";
  return "#4caf50";
}

// ─── TaskListItem ─────────────────────────────────────────────────────────────
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

function TaskListItem({
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
  const t = useAppTheme();
  const s = useMemo(() => makeStyles(t), [t]);

  const eventDate = new Date(task.event_date);
  const h = eventDate.getHours();
  const m = eventDate.getMinutes();
  const sv = eventDate.getSeconds();
  const timeLabel = is24h ? formatTime24(h, m, sv) : formatTime12(h, m, sv);
  const isDone = task.status === "done";

  return (
    <TouchableOpacity
      onLongPress={() => onLongPress(task)}
      activeOpacity={0.8}
      style={[s.taskItem, isDone && s.taskItemDone, selected && s.taskItemSelected]}
    >
      <TouchableOpacity
        style={[s.checkbox, isDone && s.checkboxDone]}
        onPress={() => onToggleDone(task)}
      >
        {isDone && <Text style={s.checkmark}>✓</Text>}
      </TouchableOpacity>
      <View style={s.taskInfo}>
        <Text style={[s.taskTitle, isDone && s.taskTitleDone]}>{task.title}</Text>
        <Text style={s.taskMeta}>
          {eventDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · {timeLabel} · -{task.reminder_minutes} min
        </Text>
        {(task.category || task.priority) && (
          <View style={s.taskBadgeRow}>
            {task.category && (
              <View style={s.categoryBadge}>
                <Text style={s.categoryBadgeText}>{task.category}</Text>
              </View>
            )}
            {task.priority && (
              <View style={[s.priorityBadge, { borderColor: priorityColor(task.priority) }]}>
                <Text style={[s.priorityBadgeText, { color: priorityColor(task.priority) }]}>
                  {task.priority}
                </Text>
              </View>
            )}
          </View>
        )}
        {task.notes ? (
          <Text style={s.taskNotes} numberOfLines={2}>
            {task.notes}
          </Text>
        ) : null}
      </View>
      <View style={s.taskActions}>
        <TouchableOpacity style={s.taskShareButton} onPress={() => onShare(task)}>
          <Text style={s.taskShareText}>↑</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.taskEditButton} onPress={() => onEdit(task)}>
          <Text style={s.taskEditText}>✎</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.taskPostponeButton} onPress={() => onPostpone(task)}>
          <Text style={s.taskPostponeText}>↻</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.taskDeleteButton} onPress={() => onDelete(task)}>
          <Text style={s.taskDeleteText}>✕</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [isDark, setIsDark] = useState(true);
  const theme = isDark ? DARK : LIGHT;
  const s = useMemo(() => makeStyles(theme), [theme]);

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
  const [workHoursBias, setWorkHoursBias] = useState(false);
  const [skipLunch, setSkipLunch] = useState(false);
  const [skipSleep, setSkipSleep] = useState(false);

  // Phase 10 — ADHD nudger state
  const [energyLevel, setEnergyLevelState] = useState<EnergyLevel | null>(null);
  const [energyPromptDismissed, setEnergyPromptDismissed] = useState(false);
  const [preNudgeEnabled, setPreNudgeEnabled] = useState(true);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Phase 7 — Random duration generator state
  const [durationOpen, setDurationOpen] = useState(false);
  const [durationMin, setDurationMin] = useState("15");
  const [durationMax, setDurationMax] = useState("60");
  const [durationResult, setDurationResult] = useState<number | null>(null);
  const [durationError, setDurationError] = useState<string | null>(null);
  const [durationCopied, setDurationCopied] = useState(false);

  // Phase 11.1 — App Control hook. Only consumed by the __DEV__ smoke card
  // for now; will move into a proper Settings screen in 11.2.
  const appControl = useAppControl();

  // Phase 12 — overlay permission gate
  const [hasDismissedOverlayGate, setHasDismissedOverlayGate] = useState(false);
  // Tracks previous overlay permission value so we can detect false → true transitions.
  const prevOverlayGrantedRef = useRef<boolean | null>(null);

  // Phase 13 — Tab navigation
  const [activeTab, setActiveTab] = useState<'Home' | 'Progress'>('Home');

  const isMountedRef = useRef(false);

  // Tick every second so the Next Nudge countdown stays fresh.
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadTasks = useCallback(async () => {
    const fetched = await getTasks();
    setTasks(fetched);
  }, []);

  // Initialize DB and load persisted settings
  useEffect(() => {
    const init = async () => {
      await getDb();
      void purgeOldCompletions(); // Fire-and-forget: cleanup old completions without blocking app load

      const saved24h = await getSetting("is24h");
      const savedMinH = await getSetting("min_h");
      const savedMinM = await getSetting("min_m");
      const savedMinS = await getSetting("min_s");
      const savedMaxH = await getSetting("max_h");
      const savedMaxM = await getSetting("max_m");
      const savedMaxS = await getSetting("max_s");
      const savedDefaultReminder = await getSetting("default_reminder");
      const savedTheme = await getSetting("theme");
      const savedWorkBias = await getSetting("work_hours_bias");
      const savedSkipLunch = await getSetting("skip_lunch");
      const savedSkipSleep = await getSetting("skip_sleep");
      // Phase 10
      const savedEnergy = await getSetting("energy_level");
      const savedEnergyDate = await getSetting("energy_date");
      const savedPreNudge = await getSetting("pre_nudge_enabled");
      // Phase 7 — random duration
      const savedDurationMin = await getSetting("duration_min_minutes");
      const savedDurationMax = await getSetting("duration_max_minutes");
      // Phase 12 — overlay permission gate dismissed flag
      const savedOverlayGateDismissed = await getSetting("overlay_gate_dismissed");

      if (saved24h !== null) setIs24h(saved24h === "true");
      if (savedMinH !== null) setMinH(savedMinH);
      if (savedMinM !== null) setMinM(savedMinM);
      if (savedMinS !== null) setMinS(savedMinS);
      if (savedMaxH !== null) setMaxH(savedMaxH);
      if (savedMaxM !== null) setMaxM(savedMaxM);
      if (savedMaxS !== null) setMaxS(savedMaxS);
      if (savedDefaultReminder !== null) setDefaultReminder(savedDefaultReminder);
      if (savedTheme !== null) setIsDark(savedTheme === "dark");
      if (savedWorkBias !== null) setWorkHoursBias(savedWorkBias === "true");
      if (savedSkipLunch !== null) setSkipLunch(savedSkipLunch === "true");
      if (savedSkipSleep !== null) setSkipSleep(savedSkipSleep === "true");
      if (savedPreNudge !== null) setPreNudgeEnabled(savedPreNudge === "true");
      if (savedDurationMin !== null) setDurationMin(savedDurationMin);
      if (savedDurationMax !== null) setDurationMax(savedDurationMax);
      if (savedOverlayGateDismissed === "true") setHasDismissedOverlayGate(true);

      // Energy level: only carry over if it was set today; otherwise prompt.
      const todayKey = localDateKey();
      if (savedEnergyDate === todayKey && savedEnergy) {
        setEnergyLevelState(savedEnergy as EnergyLevel);
      }

      await loadTasks();
    };

    // A rejection anywhere in init() (SQLite open, a migration, any getSetting)
    // previously became an unhandled rejection AND left dbReady false forever —
    // on a sideloaded release build that is an app stuck on an empty screen with
    // no way to recover. Always flip dbReady so the UI renders with defaults.
    init()
      .then(() => {
        // Arm the settings-persistence effects only once the saved values are
        // actually in state. If init failed partway, the state still holds
        // defaults and those effects would write them back over the user's
        // stored settings.
        isMountedRef.current = true;
      })
      .catch((err: unknown) => {
        console.error("[App] initialization failed:", err);
      })
      .finally(() => {
        setDbReady(true);
      });
  }, [loadTasks]);

  // Notification action handlers (Done / Postpone / Re-roll from tray)
  useEffect(() => {
    const minTotalFn = () =>
      timeToSeconds(parseVal(minH, 23), parseVal(minM, 59), parseVal(minS, 59));
    const maxTotalFn = () =>
      timeToSeconds(parseVal(maxH, 23), parseVal(maxM, 59), parseVal(maxS, 59));

    const rescheduleTask = async (taskId: number, useWeighted: boolean) => {
      const task = (await getTasks()).find((t) => t.id === taskId);
      if (!task) return;
      const minTotal = minTotalFn();
      const maxTotal = maxTotalFn();

      let randomTotal: number;
      if (useWeighted) {
        const { weights, excluded } = buildBiasConfig({
          workHoursBias,
          skipLunch,
          skipSleep,
        });
        randomTotal = generateWeightedRandom(minTotal, maxTotal, weights, excluded);
      } else {
        const range = Math.max(maxTotal - minTotal, 0);
        randomTotal = Math.floor(Math.random() * (range + 1)) + minTotal;
      }

      const newDate = nextOccurrence(new Date(task.event_date), randomTotal);

      await cancelTaskNotifications(task);

      const reminderId = await scheduleReminder(task.title, newDate, task.reminder_minutes);
      const alarmId = await scheduleAlarm(task.title, newDate, task.id);
      // Pre-nudge if enabled and the new alarm is far enough out.
      const nudgeId = preNudgeEnabled
        ? await scheduleGentleNudge(task.title, newDate, 5)
        : null;

      // Persist the pre-nudge id alongside the reminder id. It used to be
      // discarded, so the "Heads up" notification could never be cancelled and
      // fired as a ghost after the task was deleted or rescheduled again.
      const secondaryIds = [reminderId, nudgeId].filter(
        (id): id is string => id != null
      );
      await updateTaskTime(
        task.id,
        newDate.toISOString(),
        alarmId,
        reminderId,
        JSON.stringify(secondaryIds)
      );
      await loadTasks();
    };

    const cleanupNotif = setupNotificationResponseHandler({
      onDone: async (taskId) => {
        await updateTaskStatus(taskId, "done");
        await loadTasks();
      },
      onPostpone: (taskId) => {
        void rescheduleTask(taskId, false);
      },
      onReroll: (taskId) => {
        void rescheduleTask(taskId, true);
      },
    });

    // Phase 12 — also handle overlay alarm actions (same Done/Postpone/Reroll
    // semantics, but taskId is a string from the overlay bridge).
    const cleanupOverlay = setupOverlayAlarmResponseHandler({
      onDone: async (taskId) => {
        const numId = parseInt(taskId, 10);
        if (!isNaN(numId)) {
          await updateTaskStatus(numId, "done");
          await loadTasks();
        }
      },
      onPostpone: (taskId) => {
        const numId = parseInt(taskId, 10);
        if (!isNaN(numId)) void rescheduleTask(numId, false);
      },
      onReroll: (taskId) => {
        const numId = parseInt(taskId, 10);
        if (!isNaN(numId)) void rescheduleTask(numId, true);
      },
    });

    return () => {
      cleanupNotif();
      cleanupOverlay();
    };
  }, [
    loadTasks,
    minH, minM, minS, maxH, maxM, maxS,
    workHoursBias, skipLunch, skipSleep,
    preNudgeEnabled,
  ]);

  // Persist settings
  useEffect(() => {
    if (!isMountedRef.current) return;
    upsertSetting("is24h", String(is24h));
  }, [is24h]);

  useEffect(() => {
    if (!isMountedRef.current) return;
    upsertSetting("min_h", minH);
    upsertSetting("min_m", minM);
    upsertSetting("min_s", minS);
  }, [minH, minM, minS]);

  useEffect(() => {
    if (!isMountedRef.current) return;
    upsertSetting("max_h", maxH);
    upsertSetting("max_m", maxM);
    upsertSetting("max_s", maxS);
  }, [maxH, maxM, maxS]);

  useEffect(() => {
    if (!isMountedRef.current) return;
    upsertSetting("default_reminder", defaultReminder);
  }, [defaultReminder]);

  useEffect(() => {
    if (!isMountedRef.current) return;
    upsertSetting("theme", isDark ? "dark" : "light");
  }, [isDark]);

  const parseVal = (v: string, max: number): number => {
    const n = parseInt(v, 10);
    if (isNaN(n)) return 0;
    return clamp(n, 0, max);
  };

  const formatResult = useCallback(
    (h: number, m: number, sv: number) => {
      return is24h ? formatTime24(h, m, sv) : formatTime12(h, m, sv);
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

    const flags: BiasFlags = { workHoursBias, skipLunch, skipSleep };
    const { weights, excluded } = buildBiasConfig(flags);

    const generated: { h: number; m: number; s: number }[] = [];
    for (let i = 0; i < generateCount; i++) {
      const randomTotal = generateWeightedRandom(
        minTotal,
        maxTotal,
        weights,
        excluded
      );
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

  const toggleWorkHoursBias = useCallback(async () => {
    const next = !workHoursBias;
    setWorkHoursBias(next);
    Haptics.selectionAsync();
    await upsertSetting("work_hours_bias", next ? "true" : "false");
  }, [workHoursBias]);

  const toggleSkipLunch = useCallback(async () => {
    const next = !skipLunch;
    setSkipLunch(next);
    Haptics.selectionAsync();
    await upsertSetting("skip_lunch", next ? "true" : "false");
  }, [skipLunch]);

  const toggleSkipSleep = useCallback(async () => {
    const next = !skipSleep;
    setSkipSleep(next);
    Haptics.selectionAsync();
    await upsertSetting("skip_sleep", next ? "true" : "false");
  }, [skipSleep]);

  // Phase 10 — energy level persistence
  const setEnergyLevel = useCallback(async (level: EnergyLevel) => {
    setEnergyLevelState(level);
    Haptics.selectionAsync();
    const todayKey = localDateKey();
    await upsertSetting("energy_level", level);
    await upsertSetting("energy_date", todayKey);
  }, []);

  const dismissEnergyPrompt = useCallback(() => {
    setEnergyPromptDismissed(true);
  }, []);

  // Phase 12 — auto-clear the overlay gate dismissed flag when the user
  // grants the overlay permission (false → true transition).
  useEffect(() => {
    const granted = appControl.permissions?.overlay ?? null;
    if (granted === null) return;
    const prev = prevOverlayGrantedRef.current;
    prevOverlayGrantedRef.current = granted;
    // Only act on the transition: was false (or unknown), now true.
    if (prev !== true && granted === true) {
      setHasDismissedOverlayGate(false);
      // Persist the cleared state so the card stays hidden on re-launch.
      void upsertSetting("overlay_gate_dismissed", "false");
    }
  }, [appControl.permissions?.overlay]);

  const togglePreNudge = useCallback(async () => {
    const next = !preNudgeEnabled;
    setPreNudgeEnabled(next);
    Haptics.selectionAsync();
    await upsertSetting("pre_nudge_enabled", next ? "true" : "false");
  }, [preNudgeEnabled]);

  // ─── Phase 7 — Random duration generator ─────────────────────────────────
  const toggleDurationOpen = useCallback(() => {
    setDurationOpen((v) => !v);
    Haptics.selectionAsync();
  }, []);

  const generateDuration = useCallback(async () => {
    const minN = parseInt(durationMin, 10);
    const maxN = parseInt(durationMax, 10);
    const err = validateDurationBounds({ minMinutes: minN, maxMinutes: maxN });
    if (err) {
      setDurationError(err);
      setDurationResult(null);
      return;
    }
    setDurationError(null);
    setDurationCopied(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const value = generateRandomDuration(minN, maxN);
    setDurationResult(value);
    // Persist the bounds the user actually generated against (not on every keystroke).
    await upsertSetting("duration_min_minutes", String(minN));
    await upsertSetting("duration_max_minutes", String(maxN));
  }, [durationMin, durationMax]);

  const copyDuration = useCallback(async () => {
    if (durationResult == null) return;
    await Clipboard.setStringAsync(formatDuration(durationResult));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setDurationCopied(true);
    setTimeout(() => setDurationCopied(false), 2000);
  }, [durationResult]);

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

  const categoryStats = useMemo((): [string, number][] => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      const cat: string = task.category ?? "Other";
      counts[cat] = (counts[cat] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [tasks]);

  const streakInfo = useMemo(() => computeStreak(tasks), [tasks]);
  const streak = streakInfo.streak;

  /**
   * Phase 10 — Next Nudge.
   * Earliest pending task whose event_date is in the future, plus the
   * seconds-until-fire (recomputed via the nowTick interval above).
   */
  const nextNudge = useMemo(() => {
    const now = nowTick;
    const upcoming = tasks
      .filter((t) => t.status === "pending")
      .map((t) => ({ task: t, ts: new Date(t.event_date).getTime() }))
      .filter((e) => e.ts > now)
      .sort((a, b) => a.ts - b.ts);
    if (upcoming.length === 0) return null;
    const first = upcoming[0];
    return {
      task: first.task,
      secondsUntil: Math.floor((first.ts - now) / 1000),
    };
  }, [tasks, nowTick]);

  /** Should the energy prompt card be shown? Once per day, unless dismissed. */
  const showEnergyPrompt = energyLevel === null && !energyPromptDismissed;

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

  const handleExportTasks = useCallback(async () => {
    const allTasks = await getTasks();
    if (allTasks.length === 0) {
      Alert.alert("No tasks", "There are no tasks to export.");
      return;
    }
    const payload = {
      exportedAt: new Date().toISOString(),
      count: allTasks.length,
      tasks: allTasks,
    };
    const json = JSON.stringify(payload, null, 2);
    await Share.share({
      message: json,
      title: "RandomTime Tasks Backup",
    });
  }, []);

  const handleShareTask = useCallback(
    (task: Task) => {
      const d = new Date(task.event_date);
      const dateStr = d.toLocaleDateString(undefined, {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const h = d.getHours(), m = d.getMinutes(), sv = d.getSeconds();
      const timeStr = is24h ? formatTime24(h, m, sv) : formatTime12(h, m, sv);
      const lines = [`📅 ${task.title}`, `🕐 ${dateStr} at ${timeStr}`];
      if (task.category) lines.push(`🏷 ${task.category}`);
      if (task.priority) lines.push(`⚡ Priority: ${task.priority}`);
      if (task.notes) lines.push(`📝 ${task.notes}`);
      Share.share({ message: lines.join("\n") });
    },
    [is24h]
  );

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

      const newDate = nextOccurrence(new Date(task.event_date), randomTotal);

      await cancelTaskNotifications(task);

      const reminderId = await scheduleReminder(task.title, newDate, task.reminder_minutes);
      // task.id is required: it puts taskId in the notification payload (without
      // it the tray's Done/Postpone/Re-roll buttons are inert) and is the key
      // the native overlay alarm is scheduled under.
      const alarmId = await scheduleAlarm(task.title, newDate, task.id);
      const nudgeId = preNudgeEnabled
        ? await scheduleGentleNudge(task.title, newDate, 5)
        : null;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const secondaryIds = [reminderId, nudgeId].filter(
        (id): id is string => id != null
      );
      await updateTaskTime(
        task.id,
        newDate.toISOString(),
        alarmId,
        reminderId,
        JSON.stringify(secondaryIds)
      );
      await loadTasks();
    },
    [minH, minM, minS, maxH, maxM, maxS, loadTasks, preNudgeEnabled]
  );

  /**
   * Phase 10 — Surprise Me.
   * Pick N pending tasks (N scales with energy level) and scatter them across
   * today using the weighted engine + current bias settings. Reschedules
   * their notifications.
   */
  const handleSurpriseMe = useCallback(async () => {
    const pending = tasks.filter((t) => t.status === "pending");
    if (pending.length === 0) {
      Alert.alert("Nothing to surprise-me with", "Add some pending tasks first.");
      return;
    }

    const minTotal = timeToSeconds(
      parseVal(minH, 23), parseVal(minM, 59), parseVal(minS, 59)
    );
    const maxTotal = timeToSeconds(
      parseVal(maxH, 23), parseVal(maxM, 59), parseVal(maxS, 59)
    );
    if (minTotal > maxTotal) {
      Alert.alert("Invalid range", "Min time must be ≤ max time.");
      return;
    }

    const { weights, excluded } = buildBiasConfig({
      workHoursBias,
      skipLunch,
      skipSleep,
    });

    const plan = planSurpriseMe({
      pendingTasks: pending.map((t) => ({ id: t.id, event_date: t.event_date })),
      count: nudgeCountForEnergy(energyLevel),
      today: new Date(),
      minSeconds: minTotal,
      maxSeconds: maxTotal,
      weights,
      excluded,
    });

    if (plan.length === 0) {
      Alert.alert("Surprise Me", "Nothing to reschedule right now.");
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    for (const item of plan) {
      const task = pending.find((t) => t.id === item.taskId);
      if (!task) continue;
      // planSurpriseMe scatters across *today*, so a slot earlier than the
      // current time would otherwise be written back as an unfireable past date.
      const planned = new Date(item.newEventDateIso);
      const newDate = nextOccurrence(
        planned,
        planned.getHours() * 3600 + planned.getMinutes() * 60 + planned.getSeconds()
      );

      await cancelTaskNotifications(task);

      const reminderId = await scheduleReminder(task.title, newDate, task.reminder_minutes);
      const alarmId = await scheduleAlarm(task.title, newDate, task.id);
      const nudgeId = preNudgeEnabled
        ? await scheduleGentleNudge(task.title, newDate, 5)
        : null;

      const secondaryIds = [reminderId, nudgeId].filter(
        (id): id is string => id != null
      );
      await updateTaskTime(
        task.id,
        newDate.toISOString(),
        alarmId,
        reminderId,
        JSON.stringify(secondaryIds)
      );
    }

    await loadTasks();
    Alert.alert(
      "Surprised you",
      `${plan.length} task${plan.length === 1 ? "" : "s"} scattered across today.`
    );
  }, [
    tasks,
    minH, minM, minS, maxH, maxM, maxS,
    workHoursBias, skipLunch, skipSleep,
    energyLevel, preNudgeEnabled,
    loadTasks,
  ]);

  const handleToggleDone = useCallback(
    async (task: Task) => {
      const newStatus = task.status === "done" ? "pending" : "done";

      // Phase 10 — celebration haptic pattern when MARKING DONE.
      // Unmarking (done → pending) stays quiet.
      if (newStatus === "done") {
        // Always fire a success pulse. For longer streaks, stack a second
        // pulse shortly after for a "double-tap" feel.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (streak >= 3) {
          setTimeout(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          }, 140);
        }
        if (streak >= 7) {
          setTimeout(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          }, 280);
        }
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      await updateTaskStatus(task.id, newStatus);
      await loadTasks();
    },
    [loadTasks, streak]
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

  const doneCount = tasks.filter((t) => t.status === "done").length;
  const completeRate = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  return (
    <ThemeContext.Provider value={theme}>
      <SafeAreaProvider>
        <SafeAreaView style={s.container}>
          <StatusBar style={isDark ? "light" : "dark"} />

          {/* Tab Content */}
          {activeTab === 'Home' ? (
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={s.flex}
            >
              <ScrollView
                contentContainerStyle={s.scrollContent}
                keyboardShouldPersistTaps="handled"
              >
              <Text style={s.title}>Random Time</Text>
              <Text style={s.subtitle}>Generator</Text>

              {/* Phase 11.1 — Debug smoke card. __DEV__ only.
                  Lets us verify on-device that:
                    1) NativeModules.AppControl is registered (isAvailable)
                    2) getPermissionStatus reflects the real device state
                    3) requestX() deep-links to the right Settings screen
                    4) AppState-resume auto-refreshes the status afterwards
                  Removed once 11.2 lands the real Settings panel. */}
              {__DEV__ && (
                <View style={s.debugCard}>
                  <Text style={s.debugCardTitle}>🔧 App Control (dev)</Text>
                  <Text style={s.debugCardLine}>
                    isAvailable: {appControl.isAvailable ? "true" : "false"}
                  </Text>
                  <Text style={s.debugCardLine}>
                    loading: {appControl.loading ? "true" : "false"}
                  </Text>
                  {appControl.error && (
                    <Text style={[s.debugCardLine, { color: theme.danger }]}>
                      error: {appControl.error.message}
                    </Text>
                  )}
                  {[
                    {
                      key: "usageStats" as const,
                      label: "Usage Stats",
                      onRequest: appControl.requestUsageStats,
                    },
                    {
                      key: "overlay" as const,
                      label: "Overlay",
                      onRequest: appControl.requestOverlay,
                    },
                    {
                      key: "accessibility" as const,
                      label: "Accessibility",
                      onRequest: appControl.requestAccessibility,
                    },
                  ].map(({ key, label, onRequest }) => (
                    <View key={key} style={s.debugCardRow}>
                      <Text style={s.debugCardRowLabel}>
                        {appControl.permissions?.[key] ? "✅" : "⬜"} {label}
                      </Text>
                      <TouchableOpacity
                        style={s.debugCardButton}
                        onPress={onRequest}
                        accessibilityLabel={`Request ${label} permission`}
                      >
                        <Text style={s.debugCardButtonText}>Request</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  <TouchableOpacity
                    style={[s.debugCardButton, { alignSelf: "flex-start", marginTop: 6 }]}
                    onPress={appControl.refresh}
                    accessibilityLabel="Refresh permission status"
                  >
                    <Text style={s.debugCardButtonText}>Refresh</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Phase 12 — Overlay permission gate card (production-visible).
                  Shows when overlay permission is not granted AND the user has
                  not dismissed it this session (persisted across launches). */}
              {appControl.isAvailable &&
                appControl.permissions?.overlay === false &&
                !hasDismissedOverlayGate && (
                  <View style={s.overlayPermissionCard}>
                    <Text style={s.overlayPermissionTitle}>
                      Enable Full-Screen Alarms
                    </Text>
                    <Text style={s.overlayPermissionBody}>
                      Random Time can pop a full-screen alarm with Done /
                      Postpone / Re-roll buttons even when you&apos;re in
                      another app. Grant &quot;Display over other apps&quot; to
                      enable it.
                    </Text>
                    <View style={s.overlayPermissionRow}>
                      <TouchableOpacity
                        style={s.overlayPermissionBtnPrimary}
                        onPress={appControl.requestOverlay}
                        accessibilityLabel="Enable display over other apps permission"
                        accessibilityRole="button"
                      >
                        <Text style={s.overlayPermissionBtnText}>Enable</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.overlayPermissionBtnSecondary}
                        onPress={async () => {
                          setHasDismissedOverlayGate(true);
                          await upsertSetting("overlay_gate_dismissed", "true");
                        }}
                        accessibilityLabel="Dismiss overlay permission prompt"
                        accessibilityRole="button"
                      >
                        <Text style={[s.overlayPermissionBtnText, { color: theme.textMuted }]}>
                          Not now
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

              {/* Phase 10 — Next Nudge card */}
              {dbReady && nextNudge && (
                <View
                  style={s.nextNudgeCard}
                  accessibilityRole="summary"
                  accessibilityLabel={`Next nudge: ${nextNudge.task.title} in ${formatCountdown(
                    nextNudge.secondsUntil
                  )}`}
                >
                  <Text style={s.nextNudgeLabel}>NEXT NUDGE</Text>
                  <Text style={s.nextNudgeTitle} numberOfLines={1}>
                    {nextNudge.task.title}
                  </Text>
                  <Text style={s.nextNudgeCountdown}>
                    in {formatCountdown(nextNudge.secondsUntil)}
                  </Text>
                </View>
              )}

              {/* Phase 10 — Energy check-in (once/day) */}
              {dbReady && showEnergyPrompt && (
                <View style={s.energyCard}>
                  <View style={s.energyHeaderRow}>
                    <Text style={s.energyTitle}>How's your energy today?</Text>
                    <TouchableOpacity
                      onPress={dismissEnergyPrompt}
                      accessibilityLabel="Dismiss energy prompt"
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={s.energyDismiss}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={s.energyRow}>
                    {(["low", "medium", "high"] as const).map((lvl) => (
                      <TouchableOpacity
                        key={lvl}
                        style={s.energyChip}
                        onPress={() => setEnergyLevel(lvl)}
                        accessibilityRole="button"
                        accessibilityLabel={`Set energy level to ${lvl}`}
                      >
                        <Text style={s.energyChipText}>
                          {lvl === "low" ? "😴 Low" : lvl === "medium" ? "🙂 Medium" : "⚡ High"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              {/* Phase 10 — Surprise Me (only shown if there are pending tasks) */}
              {dbReady && tasks.some((t) => t.status === "pending") && (
                <TouchableOpacity
                  style={s.surpriseMeButton}
                  onPress={handleSurpriseMe}
                  accessibilityRole="button"
                  accessibilityLabel="Surprise me — scatter some pending tasks across today"
                >
                  <Text style={s.surpriseMeText}>
                    🎲 Surprise Me ({nudgeCountForEnergy(energyLevel)})
                  </Text>
                </TouchableOpacity>
              )}

              {/* Settings Panel */}
              <TouchableOpacity
                style={s.settingsToggle}
                onPress={() => setSettingsVisible((v) => !v)}
              >
                <Text style={s.settingsToggleText}>
                  {settingsVisible ? "▲ Settings" : "▼ Settings"}
                </Text>
              </TouchableOpacity>
              {settingsVisible && (
                <View style={s.settingsPanel}>
                  {/* Default Reminder */}
                  <Text style={s.settingsSectionLabel}>Default Reminder (minutes)</Text>
                  <TextInput
                    style={s.settingsInput}
                    keyboardType="number-pad"
                    maxLength={3}
                    value={defaultReminder}
                    onChangeText={setDefaultReminder}
                    placeholderTextColor={theme.textDim}
                    placeholder="10"
                  />

                  {/* Theme Toggle */}
                  <Text style={s.settingsSectionLabel}>Theme</Text>
                  <View style={s.themeRow}>
                    <TouchableOpacity
                      style={[s.themeChip, isDark && s.themeChipActive]}
                      onPress={() => setIsDark(true)}
                    >
                      <Text style={[s.themeChipText, isDark && s.themeChipTextActive]}>🌙 Dark</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.themeChip, !isDark && s.themeChipActive]}
                      onPress={() => setIsDark(false)}
                    >
                      <Text style={[s.themeChipText, !isDark && s.themeChipTextActive]}>☀️ Light</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Export */}
                  <TouchableOpacity style={s.settingsActionButton} onPress={handleExportTasks}>
                    <Text style={s.settingsActionText}>Export tasks as JSON</Text>
                  </TouchableOpacity>

                  {/* Delete Done */}
                  <TouchableOpacity style={s.settingsDangerButton} onPress={handleDeleteAllDone}>
                    <Text style={s.settingsDangerText}>Delete all done tasks</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Format Toggle */}
              <TouchableOpacity style={s.toggleRow} onPress={toggleFormat}>
                <Text style={[s.toggleOption, is24h && s.toggleActive]}>24H</Text>
                <View style={s.toggleTrack}>
                  <View style={[s.toggleThumb, !is24h && s.toggleThumbRight]} />
                </View>
                <Text style={[s.toggleOption, !is24h && s.toggleActive]}>12H</Text>
              </TouchableOpacity>

              {/* Range Card */}
              <View style={s.card}>
                <TimeInput
                  label="From"
                  hours={minH}
                  minutes={minM}
                  seconds={minS}
                  onChangeHours={setMinH}
                  onChangeMinutes={setMinM}
                  onChangeSeconds={setMinS}
                />
                <View style={s.divider} />
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

              {error && <Text style={s.error}>{error}</Text>}

              {/* Bias toggles — Phase 7 weighted random + excluded blocks */}
              <View style={s.biasRow}>
                <Text style={s.biasLabel}>Bias</Text>
                <TouchableOpacity
                  accessibilityRole="switch"
                  accessibilityState={{ checked: workHoursBias }}
                  style={[s.biasChip, workHoursBias && s.biasChipActive]}
                  onPress={toggleWorkHoursBias}
                >
                  <Text style={[s.biasChipText, workHoursBias && s.biasChipTextActive]}>
                    Work hours 9–17
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="switch"
                  accessibilityState={{ checked: skipLunch }}
                  style={[s.biasChip, skipLunch && s.biasChipActive]}
                  onPress={toggleSkipLunch}
                >
                  <Text style={[s.biasChipText, skipLunch && s.biasChipTextActive]}>
                    Skip lunch
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  accessibilityRole="switch"
                  accessibilityState={{ checked: skipSleep }}
                  style={[s.biasChip, skipSleep && s.biasChipActive]}
                  onPress={toggleSkipSleep}
                >
                  <Text style={[s.biasChipText, skipSleep && s.biasChipTextActive]}>
                    Skip sleep
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Count selector + Generate */}
              <View style={s.generateRow}>
                {([1, 3, 5] as const).map((n) => (
                  <TouchableOpacity
                    key={n}
                    style={[s.countChip, generateCount === n && s.countChipActive]}
                    onPress={() => setGenerateCount(n)}
                  >
                    <Text style={[s.countChipText, generateCount === n && s.countChipTextActive]}>
                      ×{n}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity style={[s.button, s.buttonFlex]} onPress={generate}>
                  <Text style={s.buttonText}>Generate</Text>
                </TouchableOpacity>
              </View>

              {/* Results */}
              {results.map((r, idx) => (
                <View key={idx} style={s.resultContainer}>
                  <Text style={s.resultLabel}>
                    {results.length > 1 ? `Time ${idx + 1}` : "Your random time"}
                  </Text>
                  <Text style={s.result}>{formatResult(r.h, r.m, r.s)}</Text>
                  <View style={s.actionRow}>
                    <TouchableOpacity style={s.copyButton} onPress={() => copyToClipboard(idx)}>
                      <Text style={s.copyButtonText}>
                        {copied && activeResultIdx === idx ? "Copied!" : "Copy"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.calendarButton}
                      onPress={() => {
                        setActiveResultIdx(idx);
                        setEditingTask(undefined);
                        setModalVisible(true);
                      }}
                    >
                      <Text style={s.calendarButtonText}>Add to Calendar</Text>
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
                isDark={isDark}
              />

              {/* History */}
              {history.length > 0 && (
                <View style={s.historyContainer}>
                  <View style={s.historyHeader}>
                    <Text style={s.historyTitle}>History</Text>
                    <TouchableOpacity onPress={() => setHistory([])}>
                      <Text style={s.clearText}>Clear</Text>
                    </TouchableOpacity>
                  </View>
                  <FlatList
                    data={history}
                    scrollEnabled={false}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item, index }) => (
                      <View style={[s.historyItem, index === 0 && s.historyItemLatest]}>
                        <Text style={s.historyIndex}>#{index + 1}</Text>
                        <Text style={[s.historyTime, index === 0 && s.historyTimeLatest]}>
                          {formatResult(item.h, item.m, item.s)}
                        </Text>
                      </View>
                    )}
                  />
                </View>
              )}

              {/* Phase 7 — Random Duration generator */}
              <View style={s.durationCard}>
                <TouchableOpacity
                  style={s.durationHeader}
                  onPress={toggleDurationOpen}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: durationOpen }}
                >
                  <Text style={s.durationTitle}>Random duration</Text>
                  <Text style={s.durationToggle}>
                    {durationOpen ? "Hide ▴" : "Show ▾"}
                  </Text>
                </TouchableOpacity>

                {durationOpen && (
                  <>
                    <Text style={s.durationHint}>
                      Pick a random length between two bounds — useful for
                      time-boxing.
                    </Text>

                    <View style={s.durationInputRow}>
                      <View style={s.durationInputCol}>
                        <Text style={s.durationInputLabel}>Min (min)</Text>
                        <TextInput
                          style={s.durationInput}
                          keyboardType="number-pad"
                          value={durationMin}
                          onChangeText={setDurationMin}
                          placeholder="15"
                          placeholderTextColor={theme.textDim}
                        />
                      </View>
                      <View style={s.durationInputCol}>
                        <Text style={s.durationInputLabel}>Max (min)</Text>
                        <TextInput
                          style={s.durationInput}
                          keyboardType="number-pad"
                          value={durationMax}
                          onChangeText={setDurationMax}
                          placeholder="60"
                          placeholderTextColor={theme.textDim}
                        />
                      </View>
                    </View>

                    {durationError && (
                      <Text style={s.error}>{durationError}</Text>
                    )}

                    <TouchableOpacity
                      style={s.button}
                      onPress={generateDuration}
                    >
                      <Text style={s.buttonText}>Generate Duration</Text>
                    </TouchableOpacity>

                    {durationResult != null && (
                      <View style={s.durationResultContainer}>
                        <Text style={s.durationResultLabel}>
                          Your random duration
                        </Text>
                        <Text style={s.durationResult}>
                          {formatDuration(durationResult)}
                        </Text>
                        <View style={s.actionRow}>
                          <TouchableOpacity
                            style={s.copyButton}
                            onPress={copyDuration}
                          >
                            <Text style={s.copyButtonText}>
                              {durationCopied ? "Copied!" : "Copy"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>

              {/* Saved Tasks */}
              {dbReady && tasks.length > 0 && (
                <View style={s.taskListContainer}>
                  {/* Header */}
                  <View style={s.taskListHeader}>
                    <Text style={s.taskListTitle}>Saved Tasks</Text>
                    {selectedIds.size > 0 && (
                      <TouchableOpacity style={s.bulkDeleteButton} onPress={handleBulkDelete}>
                        <Text style={s.bulkDeleteText}>Delete {selectedIds.size}</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Search */}
                  <TextInput
                    style={s.searchInput}
                    placeholder="Search tasks…"
                    placeholderTextColor={theme.textDim}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                  />

                  {/* Filter chips */}
                  <View style={s.filterRow}>
                    {(["all", "pending", "done"] as const).map((f) => (
                      <TouchableOpacity
                        key={f}
                        style={[s.filterChip, filterStatus === f && s.filterChipActive]}
                        onPress={() => setFilterStatus(f)}
                      >
                        <Text style={[s.filterChipText, filterStatus === f && s.filterChipTextActive]}>
                          {f === "all" ? "All" : f === "pending" ? "Pending" : "Done"}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <View style={s.filterSpacer} />
                    {(["time", "priority", "created"] as const).map((sv) => (
                      <TouchableOpacity
                        key={sv}
                        style={[s.sortChip, sortBy === sv && s.sortChipActive]}
                        onPress={() => setSortBy(sv)}
                      >
                        <Text style={[s.sortChipText, sortBy === sv && s.sortChipTextActive]}>
                          {sv === "time" ? "Time" : sv === "priority" ? "Priority" : "Created"}
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
                    <Text style={s.emptyText}>No tasks match.</Text>
                  )}
                </View>
              )}

              {/* Statistics */}
              {dbReady && tasks.length > 0 && (
                <View style={s.statsContainer}>
                  <Text style={s.statsTitle}>Statistics</Text>

                  {/* Top row: totals */}
                  <View style={s.statsRow}>
                    <View style={s.statCard}>
                      <Text style={s.statValue}>{tasks.length}</Text>
                      <Text style={s.statLabel}>Total</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statValue, { color: theme.accent }]}>{doneCount}</Text>
                      <Text style={s.statLabel}>Done</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statValue, { color: "#4caf50" }]}>{completeRate}%</Text>
                      <Text style={s.statLabel}>Complete</Text>
                    </View>
                    <View style={s.statCard}>
                      <Text style={[s.statValue, { color: "#f5a623" }]}>{streak}</Text>
                      <Text style={s.statLabel}>Streak 🔥</Text>
                    </View>
                  </View>

                  {/* Category breakdown */}
                  {categoryStats.length > 0 && (
                    <View style={s.categoryStatsContainer}>
                      <Text style={s.categoryStatsTitle}>By category</Text>
                      {categoryStats.map(([cat, count]) => {
                        const pct = Math.round((count / tasks.length) * 100);
                        return (
                          <View key={cat} style={s.categoryStatRow}>
                            <Text style={s.categoryStatName}>{cat as TaskCategory}</Text>
                            <View style={s.categoryBarTrack}>
                              <View style={[s.categoryBarFill, { width: `${pct}%` as `${number}%` }]} />
                            </View>
                            <Text style={s.categoryStatCount}>{count}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
              </ScrollView>
            </KeyboardAvoidingView>
          ) : (
            <ProgressDashboard isDark={isDark} />
          )}

          {/* Tab Bar */}
          <View style={s.tabBar}>
            <TouchableOpacity
              style={[s.tabButton, activeTab === 'Home' && s.tabButtonActive]}
              onPress={() => setActiveTab('Home')}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'Home' }}
              accessibilityLabel="Home tab"
            >
              <Text style={[s.tabButtonText, activeTab === 'Home' && s.tabButtonTextActive]}>
                Home
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.tabButton, activeTab === 'Progress' && s.tabButtonActive]}
              onPress={() => setActiveTab('Progress')}
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === 'Progress' }}
              accessibilityLabel="Progress tab"
            >
              <Text style={[s.tabButtonText, activeTab === 'Progress' && s.tabButtonTextActive]}>
                Progress
              </Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </ThemeContext.Provider>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.bg,
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
      color: t.text,
      textAlign: "center",
    },
    subtitle: {
      fontSize: 36,
      fontWeight: "800",
      color: t.accent,
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
      color: t.textDim2,
    },
    toggleActive: {
      color: t.accent,
    },
    toggleTrack: {
      width: 44,
      height: 24,
      borderRadius: 12,
      backgroundColor: t.surface2,
      justifyContent: "center",
      paddingHorizontal: 2,
    },
    toggleThumb: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: t.accent,
    },
    toggleThumbRight: {
      alignSelf: "flex-end",
    },

    // Card
    card: {
      backgroundColor: t.surface,
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
      color: t.textMuted,
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
      backgroundColor: t.surface2,
      color: t.text,
      fontSize: 28,
      fontWeight: "700",
      textAlign: "center",
      width: 70,
      height: 56,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: t.border,
    },
    inputLabel: {
      fontSize: 11,
      color: t.textDim,
      marginTop: 4,
    },
    colon: {
      fontSize: 28,
      fontWeight: "700",
      color: t.accent,
      marginHorizontal: 6,
      marginBottom: 16,
    },
    divider: {
      height: 1,
      backgroundColor: t.surface2,
      marginVertical: 16,
    },
    error: {
      color: t.danger,
      fontSize: 14,
      marginTop: 16,
      textAlign: "center",
    },

    biasRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
      marginTop: 20,
      width: "100%",
      maxWidth: 400,
    },
    biasLabel: {
      color: t.textMuted,
      fontSize: 13,
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginRight: 4,
    },
    biasChip: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
    },
    biasChipActive: {
      backgroundColor: t.accent + "22",
      borderColor: t.accent,
    },
    biasChipText: {
      color: t.textMuted,
      fontSize: 13,
      fontWeight: "600",
    },
    biasChipTextActive: {
      color: t.accent,
    },
    // Phase 7 — Random Duration panel
    durationCard: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: t.surface,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 18,
      marginBottom: 16,
    },
    durationHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    durationTitle: {
      color: t.text,
      fontSize: 16,
      fontWeight: "600",
    },
    durationToggle: {
      color: t.accent,
      fontSize: 13,
      fontWeight: "600",
    },
    durationHint: {
      color: t.textDim,
      fontSize: 13,
      marginTop: 8,
      marginBottom: 12,
    },
    durationInputRow: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 12,
    },
    durationInputCol: {
      flex: 1,
    },
    durationInputLabel: {
      color: t.textDim,
      fontSize: 12,
      marginBottom: 4,
    },
    durationInput: {
      backgroundColor: t.bg,
      color: t.text,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    durationResultContainer: {
      marginTop: 14,
      alignItems: "center",
    },
    durationResultLabel: {
      color: t.textDim,
      fontSize: 12,
      marginBottom: 4,
    },
    durationResult: {
      color: t.accent,
      fontSize: 36,
      fontWeight: "700",
      marginBottom: 10,
    },
    // Phase 11.1 — Debug smoke card
    debugCard: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: t.surface2,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    debugCardTitle: {
      color: t.text,
      fontSize: 13,
      fontWeight: "700",
      marginBottom: 6,
    },
    debugCardLine: {
      color: t.textMuted,
      fontSize: 12,
      marginBottom: 2,
    },
    debugCardRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 6,
    },
    debugCardRowLabel: {
      color: t.text,
      fontSize: 13,
      flex: 1,
    },
    debugCardButton: {
      backgroundColor: t.accent,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    debugCardButtonText: {
      color: "#ffffff",
      fontSize: 12,
      fontWeight: "600",
    },
    // Phase 12 — Overlay permission gate card
    overlayPermissionCard: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: t.surface,
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 18,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: t.accent + "55",
    },
    overlayPermissionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: t.text,
      marginBottom: 8,
    },
    overlayPermissionBody: {
      fontSize: 14,
      color: t.textMuted,
      lineHeight: 20,
      marginBottom: 14,
    },
    overlayPermissionRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    overlayPermissionBtnPrimary: {
      backgroundColor: t.accent,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 10,
    },
    overlayPermissionBtnSecondary: {
      paddingVertical: 10,
      paddingHorizontal: 8,
    },
    overlayPermissionBtnText: {
      fontSize: 14,
      fontWeight: "600",
      color: "#ffffff",
    },
    // Phase 10 — Next Nudge card, Energy prompt, Surprise Me
    nextNudgeCard: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: t.surface,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 18,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: t.accent + "55",
    },
    nextNudgeLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: t.accent,
      letterSpacing: 1.4,
      marginBottom: 4,
    },
    nextNudgeTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: t.text,
    },
    nextNudgeCountdown: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textMuted,
      marginTop: 2,
    },
    energyCard: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: t.surface,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 18,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: t.border,
    },
    energyHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    energyTitle: {
      fontSize: 14,
      fontWeight: "700",
      color: t.text,
      flex: 1,
    },
    energyDismiss: {
      fontSize: 16,
      color: t.textDim,
      paddingHorizontal: 4,
    },
    energyRow: {
      flexDirection: "row",
      gap: 8,
    },
    energyChip: {
      flex: 1,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: t.surface2,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: "center",
    },
    energyChipText: {
      fontSize: 14,
      fontWeight: "600",
      color: t.text,
    },
    surpriseMeButton: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: t.accent + "18",
      borderRadius: 14,
      paddingVertical: 12,
      alignItems: "center",
      marginBottom: 16,
      borderWidth: 1,
      borderColor: t.accent + "44",
    },
    surpriseMeText: {
      fontSize: 15,
      fontWeight: "700",
      color: t.accent,
    },
    generateRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginTop: 20,
      width: "100%",
      maxWidth: 400,
    },
    countChip: {
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: "center",
      justifyContent: "center",
    },
    countChipActive: {
      backgroundColor: t.accent + "33",
      borderColor: t.accent,
    },
    countChipText: {
      color: t.textMuted,
      fontSize: 15,
      fontWeight: "700",
    },
    countChipTextActive: {
      color: t.accent,
    },
    buttonFlex: {
      flex: 1,
      marginTop: 0,
    },
    // Generate button
    button: {
      backgroundColor: t.accent,
      paddingVertical: 16,
      paddingHorizontal: 48,
      borderRadius: 16,
      marginTop: 28,
      width: "100%",
      maxWidth: 400,
      alignItems: "center",
      shadowColor: t.accent,
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
      color: t.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      marginBottom: 8,
    },
    result: {
      fontSize: 48,
      fontWeight: "800",
      color: t.accent,
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
      borderColor: t.accent,
    },
    copyButtonText: {
      color: t.accent,
      fontSize: 14,
      fontWeight: "600",
    },
    calendarButton: {
      paddingVertical: 8,
      paddingHorizontal: 20,
      borderRadius: 8,
      backgroundColor: t.accent,
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
      color: t.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1.5,
    },
    clearText: {
      fontSize: 13,
      color: t.danger,
      fontWeight: "600",
    },
    historyItem: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surface,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 16,
      marginBottom: 6,
    },
    historyItemLatest: {
      borderWidth: 1,
      borderColor: t.accent + "33",
    },
    historyIndex: {
      fontSize: 13,
      color: t.textDim2,
      fontWeight: "600",
      width: 32,
    },
    historyTime: {
      fontSize: 18,
      fontWeight: "700",
      color: t.historyText,
      letterSpacing: 2,
    },
    historyTimeLatest: {
      color: t.accent,
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
      color: t.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      marginBottom: 12,
    },
    taskItem: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: t.surface,
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
      color: t.text,
      marginBottom: 4,
    },
    taskMeta: {
      fontSize: 12,
      color: t.textMuted,
      letterSpacing: 0.5,
    },
    taskDeleteButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.danger + "44",
      alignItems: "center",
      justifyContent: "center",
    },
    taskDeleteText: {
      color: t.danger,
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
      borderColor: t.border,
      marginRight: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxDone: {
      backgroundColor: t.accent,
      borderColor: t.accent,
    },
    checkmark: {
      color: "#ffffff",
      fontSize: 13,
      fontWeight: "700",
    },
    taskTitleDone: {
      textDecorationLine: "line-through",
      color: t.textDim,
    },
    taskNotes: {
      fontSize: 12,
      color: t.textDim,
      marginTop: 4,
      fontStyle: "italic",
    },
    taskItemSelected: {
      borderWidth: 1,
      borderColor: t.accent,
      backgroundColor: t.surfaceSelected,
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
      backgroundColor: t.danger + "22",
      borderWidth: 1,
      borderColor: t.danger + "44",
    },
    bulkDeleteText: {
      color: t.danger,
      fontSize: 12,
      fontWeight: "700",
    },
    searchInput: {
      backgroundColor: t.surface,
      color: t.text,
      fontSize: 14,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: t.border,
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
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
    },
    filterChipActive: {
      backgroundColor: t.accent + "22",
      borderColor: t.accent,
    },
    filterChipText: {
      fontSize: 12,
      color: t.textMuted,
      fontWeight: "600",
    },
    filterChipTextActive: {
      color: t.accent,
    },
    filterSpacer: {
      flex: 1,
    },
    sortChip: {
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 8,
      backgroundColor: t.surface,
      borderWidth: 1,
      borderColor: t.border,
    },
    sortChipActive: {
      backgroundColor: t.surface2,
      borderColor: t.textMuted,
    },
    sortChipText: {
      fontSize: 11,
      color: t.textDim2,
      fontWeight: "600",
    },
    sortChipTextActive: {
      color: t.text,
    },
    emptyText: {
      color: t.textDim2,
      fontSize: 13,
      textAlign: "center",
      marginTop: 12,
    },

    // Settings
    settingsToggle: {
      alignSelf: "flex-end",
      paddingVertical: 4,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.border,
      marginBottom: 8,
    },
    settingsToggleText: {
      color: t.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    settingsPanel: {
      width: "100%",
      maxWidth: 400,
      backgroundColor: t.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      gap: 10,
    },
    settingsSectionLabel: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    settingsInput: {
      backgroundColor: t.surface2,
      color: t.text,
      fontSize: 15,
      borderRadius: 10,
      padding: 10,
      borderWidth: 1,
      borderColor: t.border,
      width: 100,
    },
    themeRow: {
      flexDirection: "row",
      gap: 8,
    },
    themeChip: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      backgroundColor: t.surface2,
    },
    themeChipActive: {
      backgroundColor: t.accent + "22",
      borderColor: t.accent,
    },
    themeChipText: {
      fontSize: 13,
      fontWeight: "600",
      color: t.textMuted,
    },
    themeChipTextActive: {
      color: t.accent,
    },
    settingsActionButton: {
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      alignItems: "center",
    },
    settingsActionText: {
      color: t.text,
      fontSize: 13,
      fontWeight: "600",
    },
    settingsDangerButton: {
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.danger + "44",
      alignItems: "center",
    },
    settingsDangerText: {
      color: t.danger,
      fontSize: 13,
      fontWeight: "600",
    },

    // Statistics
    statsContainer: {
      marginTop: 32,
      width: "100%",
      maxWidth: 400,
    },
    statsTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: t.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      marginBottom: 12,
    },
    statsRow: {
      flexDirection: "row",
      gap: 8,
    },
    statCard: {
      flex: 1,
      backgroundColor: t.surface,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: "center",
    },
    statValue: {
      fontSize: 22,
      fontWeight: "800",
      color: t.text,
    },
    statLabel: {
      fontSize: 10,
      color: t.textMuted,
      fontWeight: "600",
      marginTop: 4,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      textAlign: "center",
    },
    categoryStatsContainer: {
      marginTop: 12,
      backgroundColor: t.surface,
      borderRadius: 12,
      padding: 14,
      gap: 10,
    },
    categoryStatsTitle: {
      fontSize: 12,
      fontWeight: "600",
      color: t.textMuted,
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 4,
    },
    categoryStatRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    categoryStatName: {
      fontSize: 12,
      fontWeight: "600",
      color: t.text,
      width: 80,
    },
    categoryBarTrack: {
      flex: 1,
      height: 6,
      backgroundColor: t.surface2,
      borderRadius: 3,
      overflow: "hidden",
    },
    categoryBarFill: {
      height: 6,
      backgroundColor: t.accent,
      borderRadius: 3,
    },
    categoryStatCount: {
      fontSize: 12,
      fontWeight: "700",
      color: t.textMuted,
      width: 20,
      textAlign: "right",
    },

    // Task action buttons
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
      backgroundColor: t.surface2,
      borderRadius: 6,
      paddingVertical: 2,
      paddingHorizontal: 8,
    },
    categoryBadgeText: {
      fontSize: 11,
      color: t.textMuted,
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
      borderColor: t.textMuted + "44",
      alignItems: "center",
      justifyContent: "center",
    },
    taskEditText: {
      color: t.textMuted,
      fontSize: 15,
      fontWeight: "700",
    },
    taskPostponeButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: t.accent + "44",
      alignItems: "center",
      justifyContent: "center",
    },
    taskPostponeText: {
      color: t.accent,
      fontSize: 16,
      fontWeight: "700",
    },

    // Phase 13 — Tab bar
    tabBar: {
      flexDirection: "row",
      borderTopWidth: 1,
      borderTopColor: t.border,
      backgroundColor: t.surface,
      height: 56,
      paddingHorizontal: 8,
    },
    tabButton: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 12,
      marginHorizontal: 4,
      borderBottomWidth: 2,
      borderBottomColor: "transparent",
    },
    tabButtonActive: {
      borderBottomColor: t.accent,
      backgroundColor: t.surface2,
    },
    tabButtonText: {
      fontSize: 15,
      fontWeight: "600",
      color: t.textMuted,
    },
    tabButtonTextActive: {
      color: t.accent,
    },
  });
}
