import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import {
  Completion,
  Task,
  getCompletions,
  getTasks,
  upsertCompletion,
} from "./db";
import { AppTheme, DARK, LIGHT } from "./theme";

// ─── Constants ────────────────────────────────────────────────────────────────

export type RangeKey = "7d" | "30d" | "90d" | "1y";
type ViewMode = "Grid" | "Chart";

const RANGE_OPTIONS: RangeKey[] = ["7d", "30d", "90d", "1y"];
const VIEW_OPTIONS: ViewMode[] = ["Grid", "Chart"];

const RANGE_DAYS: Record<RangeKey, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "1y": 365,
};

/** Ranges longer than this collapse day columns into week columns. */
const WEEK_COLLAPSE_THRESHOLD = 31;
const DAYS_PER_WEEK = 7;

/** Grid geometry (kept in sync with the StyleSheet below). */
const ROW_HEIGHT = 34;
const MAX_VISIBLE_ROWS = 8;
const GRID_BODY_MAX_HEIGHT = ROW_HEIGHT * MAX_VISIBLE_ROWS;

const MAX_TITLE_CHARS = 12;

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Date helpers ─────────────────────────────────────────────────────────────

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Local-time 'YYYY-MM-DD' (avoids the UTC shift of toISOString). */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Parses 'YYYY-MM-DD' as a local date (no timezone shift). */
function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map((part) => parseInt(part, 10));
  return new Date(y, m - 1, d);
}

/** Inclusive list of day strings ending today, `count` entries long. */
function buildDays(count: number): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    out.push(toDateStr(d));
  }
  return out;
}

// ─── Column model ─────────────────────────────────────────────────────────────

interface Column {
  key: string;
  label: string;
  /** Days covered by this column: one for day mode, up to seven for week mode. */
  days: string[];
}

function buildColumns(days: string[], useWeeks: boolean): Column[] {
  if (!useWeeks) {
    return days.map((date) => ({
      key: date,
      label:
        days.length <= DAYS_PER_WEEK
          ? WEEKDAY_LABELS[parseDateStr(date).getDay()]
          : String(parseDateStr(date).getDate()),
      days: [date],
    }));
  }

  const columns: Column[] = [];
  for (let i = 0; i < days.length; i += DAYS_PER_WEEK) {
    const chunk = days.slice(i, i + DAYS_PER_WEEK);
    columns.push({
      key: `w-${chunk[0]}`,
      label: `W${columns.length + 1}`,
      days: chunk,
    });
  }
  return columns;
}

function completionKey(taskId: number, date: string): string {
  return `${taskId}|${date}`;
}

function truncate(title: string, max: number): string {
  return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

function pctOf(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((part / total) * 100)));
}

// ─── Percentage style tables ──────────────────────────────────────────────────
// Bar sizes are data-driven, but inline styles are banned project-wide, so all
// 0–100% widths/heights are pre-registered as named styles.

function buildPctStyles(prop: "width" | "height"): Record<string, ViewStyle> {
  const entries: Array<[string, ViewStyle]> = [];
  for (let i = 0; i <= 100; i++) {
    const value: `${number}%` = `${i}%`;
    entries.push([`p${i}`, prop === "width" ? { width: value } : { height: value }]);
  }
  return StyleSheet.create(Object.fromEntries(entries) as Record<string, ViewStyle>);
}

const widthPct = buildPctStyles("width");
const heightPct = buildPctStyles("height");

/** Heatmap opacity buckets for collapsed (week) cells. */
const levelStyles = StyleSheet.create({
  level0: { opacity: 0 },
  level1: { opacity: 0.3 },
  level2: { opacity: 0.55 },
  level3: { opacity: 0.8 },
  level4: { opacity: 1 },
});

function levelStyle(done: number, total: number): ViewStyle {
  if (done <= 0) return levelStyles.level0;
  const ratio = done / total;
  if (ratio <= 0.25) return levelStyles.level1;
  if (ratio <= 0.5) return levelStyles.level2;
  if (ratio < 1) return levelStyles.level3;
  return levelStyles.level4;
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ProgressDashboardProps {
  isDark?: boolean;
}

export default function ProgressDashboard({
  isDark = true,
}: ProgressDashboardProps) {
  const theme: AppTheme = isDark ? DARK : LIGHT;
  const s = useMemo(() => makeStyles(theme), [theme]);

  const [range, setRange] = useState<RangeKey>("30d");
  const [view, setView] = useState<ViewMode>("Grid");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => buildDays(RANGE_DAYS[range]), [range]);
  const startDate = days[0];
  const endDate = days[days.length - 1];
  const useWeeks = days.length > WEEK_COLLAPSE_THRESHOLD;
  const columns = useMemo(() => buildColumns(days, useWeeks), [days, useWeeks]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const rows = await getTasks();
      if (!cancelled) setTasks(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const rows = await getCompletions(startDate, endDate);
      if (cancelled) return;
      setCompletions(rows);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate]);

  const refresh = useCallback(async () => {
    const rows = await getCompletions(startDate, endDate);
    setCompletions(rows);
  }, [startDate, endDate]);

  const doneSet = useMemo(() => {
    const set = new Set<string>();
    for (const c of completions) {
      if (c.done) set.add(completionKey(c.taskId, c.date));
    }
    return set;
  }, [completions]);

  const doneCountFor = useCallback(
    (taskId: number, dayList: string[]): number =>
      dayList.reduce(
        (acc, date) => acc + (doneSet.has(completionKey(taskId, date)) ? 1 : 0),
        0
      ),
    [doneSet]
  );

  const totalsByTask = useMemo(() => {
    const map = new Map<number, number>();
    for (const task of tasks) map.set(task.id, doneCountFor(task.id, days));
    return map;
  }, [tasks, days, doneCountFor]);

  /**
   * Day columns toggle that single day. Week columns clear the whole week when
   * anything is marked, otherwise mark the week's last day.
   */
  const onToggle = useCallback(
    async (taskId: number, column: Column) => {
      const done = doneCountFor(taskId, column.days);
      if (done > 0) {
        for (const date of column.days) {
          if (doneSet.has(completionKey(taskId, date))) {
            await upsertCompletion(taskId, date, false);
          }
        }
      } else {
        await upsertCompletion(taskId, column.days[column.days.length - 1], true);
      }
      await refresh();
    },
    [doneCountFor, doneSet, refresh]
  );

  const unit = useWeeks ? "weeks" : "days";

  return (
    <View style={s.container}>
      <Text style={s.heading}>Progress</Text>

      <View style={s.segmentRow}>
        {RANGE_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[s.segment, range === option && s.segmentActive]}
            onPress={() => setRange(option)}
            accessibilityRole="button"
            accessibilityLabel={`Range ${option}`}
          >
            <Text style={[s.segmentText, range === option && s.segmentTextActive]}>
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.segmentRow}>
        {VIEW_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option}
            style={[s.segment, view === option && s.segmentActive]}
            onPress={() => setView(option)}
            accessibilityRole="button"
            accessibilityLabel={`${option} view`}
          >
            <Text style={[s.segmentText, view === option && s.segmentTextActive]}>
              {option}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.centerBox}>
          <ActivityIndicator color={theme.accent} />
        </View>
      ) : tasks.length === 0 ? (
        <View style={s.centerBox}>
          <Text style={s.emptyText}>No tasks yet — add one to track progress.</Text>
        </View>
      ) : view === "Grid" ? (
        <GridView
          s={s}
          columns={columns}
          tasks={tasks}
          totalsByTask={totalsByTask}
          doneCountFor={doneCountFor}
          onToggle={onToggle}
          useWeeks={useWeeks}
        />
      ) : (
        <ChartView
          s={s}
          columns={columns}
          tasks={tasks}
          totalsByTask={totalsByTask}
          doneCountFor={doneCountFor}
          totalDays={days.length}
          unit={unit}
        />
      )}
    </View>
  );
}

// ─── Grid view ────────────────────────────────────────────────────────────────

type Styles = ReturnType<typeof makeStyles>;

interface GridViewProps {
  s: Styles;
  columns: Column[];
  tasks: Task[];
  totalsByTask: Map<number, number>;
  doneCountFor: (taskId: number, days: string[]) => number;
  onToggle: (taskId: number, column: Column) => Promise<void>;
  useWeeks: boolean;
}

function GridView({
  s,
  columns,
  tasks,
  totalsByTask,
  doneCountFor,
  onToggle,
  useWeeks,
}: GridViewProps) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={s.gridRow}>
          <View style={s.rowHeader}>
            <Text style={s.columnLabel}>Task</Text>
          </View>
          {columns.map((column) => (
            <View key={column.key} style={s.cell}>
              <Text style={s.columnLabel} numberOfLines={1}>
                {column.label}
              </Text>
            </View>
          ))}
          <View style={s.rowTail}>
            <Text style={s.columnLabel}>Σ</Text>
          </View>
        </View>

        <ScrollView style={s.gridBody} nestedScrollEnabled>
          {tasks.map((task) => (
            <View key={task.id} style={s.gridRow}>
              <View style={s.rowHeader}>
                <Text style={s.taskLabel} numberOfLines={1}>
                  {truncate(task.title, MAX_TITLE_CHARS)}
                </Text>
              </View>

              {columns.map((column) => {
                const done = doneCountFor(task.id, column.days);
                return (
                  <TouchableOpacity
                    key={column.key}
                    style={s.cell}
                    onPress={() => void onToggle(task.id, column)}
                    accessibilityRole="button"
                    accessibilityLabel={`${task.title} ${column.label} ${
                      done > 0 ? "done" : "not done"
                    }`}
                  >
                    <View
                      style={[s.circle, !useWeeks && done > 0 && s.circleDone]}
                    >
                      {useWeeks ? (
                        <View
                          style={[
                            s.circleFill,
                            levelStyle(done, column.days.length),
                          ]}
                        />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}

              <View style={s.rowTail}>
                <Text style={s.tailText}>{totalsByTask.get(task.id) ?? 0}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

// ─── Chart view ───────────────────────────────────────────────────────────────

interface ChartViewProps {
  s: Styles;
  columns: Column[];
  tasks: Task[];
  totalsByTask: Map<number, number>;
  doneCountFor: (taskId: number, days: string[]) => number;
  totalDays: number;
  unit: string;
}

function ChartView({
  s,
  columns,
  tasks,
  totalsByTask,
  doneCountFor,
  totalDays,
  unit,
}: ChartViewProps) {
  const bars = columns.map((column) => {
    const done = tasks.reduce(
      (acc, task) => acc + doneCountFor(task.id, column.days),
      0
    );
    const possible = tasks.length * column.days.length;
    return { key: column.key, label: column.label, pct: pctOf(done, possible) };
  });

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <Text style={s.sectionTitle}>Completion by {unit === "weeks" ? "week" : "day"}</Text>

      <View style={s.chartFrame}>
        <View style={s.axisColumn}>
          <Text style={s.axisLabel}>100%</Text>
          <Text style={s.axisLabel}>50%</Text>
          <Text style={s.axisLabel}>0%</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={s.barRow}>
            {bars.map((bar) => (
              <View key={bar.key} style={s.barColumn}>
                <View style={s.barTrack}>
                  <View style={[s.barFill, heightPct[`p${bar.pct}`]]} />
                </View>
                <Text style={s.barLabel} numberOfLines={1}>
                  {bar.label}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </View>

      <Text style={s.sectionTitle}>By task</Text>

      {tasks.map((task) => {
        const done = totalsByTask.get(task.id) ?? 0;
        const pct = pctOf(done, totalDays);
        return (
          <View key={task.id} style={s.taskBarBlock}>
            <View style={s.taskBarHeader}>
              <Text style={s.taskBarName} numberOfLines={1}>
                {task.title}
              </Text>
              <Text style={s.taskBarCount}>
                {done} / {totalDays} days
              </Text>
            </View>
            <View style={s.taskBarTrack}>
              <View style={[s.taskBarFill, widthPct[`p${pct}`]]} />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

function makeStyles(t: AppTheme) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.bg,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    heading: {
      color: t.text,
      fontSize: 22,
      fontWeight: "700",
      marginBottom: 12,
    },
    segmentRow: {
      flexDirection: "row",
      backgroundColor: t.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: t.border,
      padding: 3,
      marginBottom: 10,
    },
    segment: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 7,
      borderRadius: 8,
    },
    segmentActive: {
      backgroundColor: t.accent,
    },
    segmentText: {
      color: t.textMuted,
      fontSize: 13,
      fontWeight: "600",
    },
    segmentTextActive: {
      color: "#ffffff",
    },
    centerBox: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyText: {
      color: t.textMuted,
      fontSize: 14,
      textAlign: "center",
    },

    // Grid
    gridBody: {
      maxHeight: GRID_BODY_MAX_HEIGHT,
    },
    gridRow: {
      flexDirection: "row",
      alignItems: "center",
      height: ROW_HEIGHT,
    },
    rowHeader: {
      width: 92,
      paddingRight: 8,
      justifyContent: "center",
    },
    rowTail: {
      width: 40,
      alignItems: "center",
      justifyContent: "center",
    },
    cell: {
      width: 34,
      height: ROW_HEIGHT,
      alignItems: "center",
      justifyContent: "center",
    },
    columnLabel: {
      color: t.textDim,
      fontSize: 11,
      fontWeight: "600",
    },
    taskLabel: {
      color: t.text,
      fontSize: 13,
    },
    tailText: {
      color: t.historyText,
      fontSize: 12,
      fontWeight: "700",
    },
    circle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: t.border,
      backgroundColor: t.surface,
      overflow: "hidden",
    },
    circleDone: {
      backgroundColor: t.accent,
      borderColor: t.accent,
    },
    circleFill: {
      flex: 1,
      backgroundColor: t.accent,
    },

    // Chart
    sectionTitle: {
      color: t.textMuted,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 8,
      marginBottom: 8,
    },
    chartFrame: {
      flexDirection: "row",
      backgroundColor: t.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: t.border,
      padding: 10,
    },
    axisColumn: {
      height: 120,
      justifyContent: "space-between",
      marginRight: 8,
    },
    axisLabel: {
      color: t.textDim2,
      fontSize: 10,
    },
    barRow: {
      flexDirection: "row",
      alignItems: "flex-end",
    },
    barColumn: {
      width: 22,
      alignItems: "center",
    },
    barTrack: {
      width: 14,
      height: 120,
      borderRadius: 4,
      backgroundColor: t.surface2,
      justifyContent: "flex-end",
      overflow: "hidden",
    },
    barFill: {
      width: "100%",
      backgroundColor: t.accent,
      borderRadius: 4,
    },
    barLabel: {
      color: t.textDim,
      fontSize: 9,
      marginTop: 4,
    },
    taskBarBlock: {
      marginBottom: 12,
    },
    taskBarHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 4,
    },
    taskBarName: {
      color: t.text,
      fontSize: 13,
      flexShrink: 1,
      paddingRight: 8,
    },
    taskBarCount: {
      color: t.textMuted,
      fontSize: 11,
      fontWeight: "600",
    },
    taskBarTrack: {
      height: 12,
      borderRadius: 6,
      backgroundColor: t.surface2,
      overflow: "hidden",
    },
    taskBarFill: {
      height: "100%",
      backgroundColor: t.accent,
      borderRadius: 6,
    },
  });
}
