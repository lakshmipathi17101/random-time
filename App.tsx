import { useState, useCallback, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  FlatList,
} from "react-native";
import { SafeAreaView, SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import AddEventModal from "./AddEventModal";
import { updateTaskStatus, updateTaskTime, Task, getTasks } from "./db";
import {
  cancelTaskNotifications,
  scheduleReminder,
  scheduleAlarm,
  setupNotificationResponseHandler,
} from "./notificationService";
import { ThemeProvider, useTheme } from "./context/ThemeContext";
import TimeInput from "./components/TimeInput";
import TaskList from "./components/TaskList";
import StatsPanel from "./components/StatsPanel";
import SettingsPanel from "./components/SettingsPanel";
import OnboardingScreen from "./components/OnboardingScreen";
import { useSettings } from "./hooks/useSettings";
import { useTasks } from "./hooks/useTasks";
import {
  formatTime24,
  formatTime12,
  timeToSeconds,
  secondsToTime,
  parseVal,
} from "./utils/timeUtils";

const MAX_HISTORY = 10;

interface HistoryEntry {
  id: string;
  h: number;
  m: number;
  s: number;
}

export default function App() {
  const settings = useSettings();
  return (
    <ThemeProvider theme={settings.theme}>
      <AppShell settings={settings} />
    </ThemeProvider>
  );
}

// Inner component so useTheme() can access the provider above
function AppShell({ settings }: { settings: ReturnType<typeof useSettings> }) {
  const { colors, theme } = useTheme();
  const {
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
  } = useTasks();

  const [results, setResults] = useState<{ h: number; m: number; s: number }[]>([]);
  const [generateCount, setGenerateCount] = useState<1 | 3 | 5>(1);
  const [activeResultIdx, setActiveResultIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>(undefined);
  const [settingsVisible, setSettingsVisible] = useState(false);

  useEffect(() => {
    if (settings.settingsReady) loadTasks();
  }, [settings.settingsReady, loadTasks]);

  const buildRandomDate = useCallback((task: Task): Date => {
    const minTotal = timeToSeconds(
      parseVal(settings.minH, 23), parseVal(settings.minM, 59), parseVal(settings.minS, 59)
    );
    const maxTotal = timeToSeconds(
      parseVal(settings.maxH, 23), parseVal(settings.maxM, 59), parseVal(settings.maxS, 59)
    );
    const range = Math.max(maxTotal - minTotal, 0);
    const randomTotal = Math.floor(Math.random() * (range + 1)) + minTotal;
    const { h, m, s } = secondsToTime(randomTotal);
    const orig = new Date(task.event_date);
    return new Date(orig.getFullYear(), orig.getMonth(), orig.getDate(), h, m, s);
  }, [settings.minH, settings.minM, settings.minS, settings.maxH, settings.maxM, settings.maxS]);

  useEffect(() => {
    const cleanup = setupNotificationResponseHandler(
      async (taskId) => { await updateTaskStatus(taskId, "done"); await loadTasks(); },
      async (taskId) => {
        const task = (await getTasks()).find((t) => t.id === taskId);
        if (!task) return;
        const newDate = buildRandomDate(task);
        await cancelTaskNotifications(task);
        const reminderId = await scheduleReminder(task.title, newDate, task.reminder_minutes);
        const alarmId = await scheduleAlarm(task.title, newDate, task.id);
        await updateTaskTime(task.id, newDate.toISOString(), alarmId, reminderId, null);
        await loadTasks();
      }
    );
    return cleanup;
  }, [loadTasks, buildRandomDate]);

  const handlePostpone = useCallback(async (task: Task) => {
    const newDate = buildRandomDate(task);
    await cancelTaskNotifications(task);
    const reminderId = await scheduleReminder(task.title, newDate, task.reminder_minutes);
    const alarmId = await scheduleAlarm(task.title, newDate, task.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await updateTaskTime(task.id, newDate.toISOString(), alarmId, reminderId, null);
    await loadTasks();
  }, [loadTasks, buildRandomDate]);

  const handleEditTask = useCallback((task: Task) => {
    setEditingTask(task); setModalVisible(true);
  }, []);

  const formatResult = useCallback(
    (h: number, m: number, s: number) =>
      settings.is24h ? formatTime24(h, m, s) : formatTime12(h, m, s),
    [settings.is24h]
  );

  const generate = () => {
    const minTotal = timeToSeconds(parseVal(settings.minH,23),parseVal(settings.minM,59),parseVal(settings.minS,59));
    const maxTotal = timeToSeconds(parseVal(settings.maxH,23),parseVal(settings.maxM,59),parseVal(settings.maxS,59));
    if (minTotal > maxTotal) { setError("Min time must be less than or equal to max time"); setResults([]); return; }
    setError(null); setCopied(false); setActiveResultIdx(0);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const generated: { h: number; m: number; s: number }[] = [];
    for (let i = 0; i < generateCount; i++) {
      generated.push(secondsToTime(Math.floor(Math.random() * (maxTotal - minTotal + 1)) + minTotal));
    }
    setResults(generated);
    setHistory((prev) => [{ id: Date.now().toString(), ...generated[0] }, ...prev].slice(0, MAX_HISTORY));
  };

  const copyToClipboard = async (idx: number) => {
    const r = results[idx]; if (!r) return;
    await Clipboard.setStringAsync(formatResult(r.h, r.m, r.s));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setActiveResultIdx(idx); setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const styles = makeAppStyles(colors);

  return (
    <SafeAreaProvider>
      {!settings.onboardingSeen && settings.settingsReady && (
        <OnboardingScreen onDone={() => settings.setOnboardingSeen(true)} />
      )}
      <SafeAreaView style={styles.container}>
        <StatusBar style={theme === "dark" ? "light" : "dark"} />
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

            {/* Settings toggle */}
            <TouchableOpacity
              style={styles.settingsToggle}
              onPress={() => setSettingsVisible((v) => !v)}
            >
              <Text style={styles.settingsToggleText}>
                {settingsVisible ? "▲ Settings" : "▼ Settings"}
              </Text>
            </TouchableOpacity>

            {settingsVisible && (
              <SettingsPanel
                defaultReminder={settings.defaultReminder}
                onChangeDefaultReminder={settings.setDefaultReminder}
                onDeleteAllDone={handleDeleteAllDone}
                theme={settings.theme}
                onChangeTheme={settings.setTheme}
              />
            )}

            {/* 24h / 12h toggle */}
            <TouchableOpacity
              style={styles.toggleRow}
              onPress={() => {
                settings.setIs24h(!settings.is24h);
                setCopied(false);
              }}
            >
              <Text style={[styles.toggleOption, settings.is24h && styles.toggleActive]}>
                24H
              </Text>
              <View style={styles.toggleTrack}>
                <View
                  style={[styles.toggleThumb, !settings.is24h && styles.toggleThumbRight]}
                />
              </View>
              <Text style={[styles.toggleOption, !settings.is24h && styles.toggleActive]}>
                12H
              </Text>
            </TouchableOpacity>

            {/* Range card */}
            <View style={styles.card}>
              <TimeInput
                label="From"
                hours={settings.minH}
                minutes={settings.minM}
                seconds={settings.minS}
                onChangeHours={settings.setMinH}
                onChangeMinutes={settings.setMinM}
                onChangeSeconds={settings.setMinS}
              />
              <View style={styles.divider} />
              <TimeInput
                label="To"
                hours={settings.maxH}
                minutes={settings.maxM}
                seconds={settings.maxS}
                onChangeHours={settings.setMaxH}
                onChangeMinutes={settings.setMaxM}
                onChangeSeconds={settings.setMaxS}
              />
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            {/* Count chips + Generate */}
            <View style={styles.generateRow}>
              {([1, 3, 5] as const).map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[styles.countChip, generateCount === n && styles.countChipActive]}
                  onPress={() => setGenerateCount(n)}
                >
                  <Text
                    style={[
                      styles.countChipText,
                      generateCount === n && styles.countChipTextActive,
                    ]}
                  >
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
                    <Text style={styles.calendarButtonText}>Add Task</Text>
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
              onClose={() => {
                setModalVisible(false);
                setEditingTask(undefined);
              }}
              onTaskSaved={loadTasks}
              editTask={editingTask}
              defaultReminderMin={parseInt(settings.defaultReminder, 10) || 10}
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

            {/* Saved tasks — or empty state nudge */}
            {dbReady && tasks.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>🎲</Text>
                <Text style={styles.emptyStateTitle}>No tasks yet</Text>
                <Text style={styles.emptyStateBody}>
                  Generate a time above, then tap{" "}
                  <Text style={styles.emptyStateHighlight}>Add Task</Text> to
                  save it with a reminder.
                </Text>
              </View>
            )}

            {dbReady && tasks.length > 0 && (
              <TaskList
                displayedTasks={displayedTasks}
                is24h={settings.is24h}
                selectedIds={selectedIds}
                searchQuery={searchQuery}
                filterStatus={filterStatus}
                sortBy={sortBy}
                onSearchChange={setSearchQuery}
                onFilterChange={setFilterStatus}
                onSortChange={setSortBy}
                onDelete={handleDeleteTask}
                onToggleDone={handleToggleDone}
                onPostpone={handlePostpone}
                onEdit={handleEditTask}
                onShare={(task) => handleShareTask(task, settings.is24h)}
                onLongPress={handleLongPress}
                onBulkDelete={handleBulkDelete}
              />
            )}

            {/* Statistics */}
            {dbReady && tasks.length > 0 && <StatsPanel tasks={tasks} />}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function makeAppStyles(colors: ReturnType<typeof useTheme>["colors"]) { return StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
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
    color: colors.text,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 36,
    fontWeight: "800",
    color: colors.accent,
    textAlign: "center",
    marginBottom: 24,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  toggleOption: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.textDim,
  },
  toggleActive: {
    color: colors.accent,
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bgInput,
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  toggleThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
  },
  toggleThumbRight: {
    alignSelf: "flex-end",
  },
  card: {
    backgroundColor: colors.bgCard,
    borderRadius: 20,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  divider: {
    height: 1,
    backgroundColor: colors.bgInput,
    marginVertical: 16,
  },
  error: {
    color: colors.danger,
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
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.bgBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  countChipActive: {
    backgroundColor: colors.accentDim,
    borderColor: colors.accent,
  },
  countChipText: {
    color: colors.textMuted,
    fontSize: 15,
    fontWeight: "700",
  },
  countChipTextActive: {
    color: colors.accent,
  },
  buttonFlex: {
    flex: 1,
    marginTop: 0,
  },
  button: {
    backgroundColor: colors.accent,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 16,
    marginTop: 28,
    width: "100%",
    maxWidth: 400,
    alignItems: "center",
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  buttonText: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  resultContainer: {
    marginTop: 32,
    alignItems: "center",
  },
  resultLabel: {
    fontSize: 14,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  result: {
    fontSize: 48,
    fontWeight: "800",
    color: colors.accent,
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
    borderColor: colors.accent,
  },
  copyButtonText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: "600",
  },
  calendarButton: {
    paddingVertical: 8,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: colors.accent,
  },
  calendarButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
  },
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
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  clearText: {
    fontSize: 13,
    color: colors.danger,
    fontWeight: "600",
  },
  historyItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bgCard,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 6,
  },
  historyItemLatest: {
    borderWidth: 1,
    borderColor: colors.accentDim,
  },
  historyIndex: {
    fontSize: 13,
    color: colors.textDim,
    fontWeight: "600",
    width: 32,
  },
  historyTime: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textDim,
    letterSpacing: 2,
  },
  historyTimeLatest: {
    color: colors.accent,
  },
  settingsToggle: {
    alignSelf: "flex-end",
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.bgBorder,
    marginBottom: 8,
  },
  settingsToggleText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: "600",
  },
  emptyState: {
    marginTop: 40,
    alignItems: "center",
    paddingHorizontal: 24,
    width: "100%",
    maxWidth: 400,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.textMuted,
    marginBottom: 8,
  },
  emptyStateBody: {
    fontSize: 14,
    color: colors.textDim,
    textAlign: "center",
    lineHeight: 22,
  },
  emptyStateHighlight: {
    color: colors.accent,
    fontWeight: "700",
  },
}); }  // end makeAppStyles
