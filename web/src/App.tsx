import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  CSSProperties,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type Theme = "dark" | "light";
type TaskStatus = "pending" | "done";
type TaskPriority = "High" | "Medium" | "Low";
type TaskCategory = "Work" | "Personal" | "Health" | "Other";
type TaskRecurrence = "none" | "daily" | "weekdays" | "weekly";
type SortBy = "time" | "priority" | "created";
type FilterStatus = "all" | "pending" | "done";

interface Task {
  id: number;
  title: string;
  eventDate: string;
  reminderMinutes: number;
  status: TaskStatus;
  notes: string | null;
  category: TaskCategory | null;
  priority: TaskPriority | null;
  recurrence: TaskRecurrence;
  createdAt: string;
}

interface HistoryEntry {
  id: string;
  h: number;
  m: number;
  s: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, "0");

function timeToSeconds(h: number, m: number, s: number) {
  return h * 3600 + m * 60 + s;
}
function secondsToTime(total: number) {
  return { h: Math.floor(total / 3600), m: Math.floor((total % 3600) / 60), s: total % 60 };
}
function format24(h: number, m: number, s: number) {
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
function format12(h: number, m: number, s: number) {
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${pad(h12)}:${pad(m)}:${pad(s)} ${period}`;
}
function formatTime(h: number, m: number, s: number, is24h: boolean) {
  return is24h ? format24(h, m, s) : format12(h, m, s);
}
function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
function parseVal(v: string, max: number) {
  const n = parseInt(v, 10);
  return isNaN(n) ? 0 : clamp(n, 0, max);
}
function priorityColor(p: TaskPriority) {
  return p === "High" ? "#f87171" : p === "Medium" ? "#fbbf24" : "#34d399";
}
function nextId() {
  return Date.now() + Math.random();
}

// LocalStorage persistence
const LS_TASKS = "rt_tasks";
const LS_SETTINGS = "rt_settings";
interface Settings {
  theme: Theme;
  is24h: boolean;
  defaultReminder: number;
  minH: string; minM: string; minS: string;
  maxH: string; maxM: string; maxS: string;
  excludeSleep: boolean;
  excludeLunch: boolean;
  weightedRandom: boolean;
  onboarded: boolean;
}
const DEFAULT_SETTINGS: Settings = {
  theme: "dark", is24h: true, defaultReminder: 10,
  minH: "00", minM: "00", minS: "00",
  maxH: "23", maxM: "59", maxS: "59",
  excludeSleep: false, excludeLunch: false, weightedRandom: false,
  onboarded: false,
};
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_SETTINGS);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}
function saveSettings(s: Settings) {
  localStorage.setItem(LS_SETTINGS, JSON.stringify(s));
}
function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(LS_TASKS);
    if (raw) return JSON.parse(raw) as Task[];
  } catch { /* ignore */ }
  return [];
}
function saveTasks(tasks: Task[]) {
  localStorage.setItem(LS_TASKS, JSON.stringify(tasks));
}

function isInExcludedBlock(
  total: number,
  blocks: { from: number; to: number }[]
): boolean {
  for (const b of blocks) {
    if (b.from <= b.to) {
      if (total >= b.from && total <= b.to) return true;
    } else {
      if (total >= b.from || total <= b.to) return true;
    }
  }
  return false;
}

function getNextRecurrence(date: Date, rec: TaskRecurrence): Date {
  const next = new Date(date);
  if (rec === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (rec === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (rec === "weekdays") {
    next.setDate(next.getDate() + 1);
    const d = next.getDay();
    if (d === 6) next.setDate(next.getDate() + 2);
    else if (d === 0) next.setDate(next.getDate() + 1);
  }
  return next;
}

// ─── Shared Style Helpers ─────────────────────────────────────────────────────
const glass: CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--card-border)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
};
const inputStyle: CSSProperties = {
  background: "var(--input-bg)",
  border: "1px solid var(--input-border)",
  color: "var(--text)",
  borderRadius: "var(--radius-sm)",
  padding: "10px 14px",
  fontFamily: "var(--font)",
  fontSize: 14,
  outline: "none",
  transition: "border-color var(--transition), box-shadow var(--transition)",
  width: "100%",
};
const labelStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--text-muted)",
  marginBottom: 8,
  display: "block",
};
const chipStyle = (active: boolean, color?: string): CSSProperties => ({
  padding: "6px 14px",
  borderRadius: 40,
  border: `1px solid ${active ? (color ?? "var(--accent)") : "var(--card-border)"}`,
  background: active ? (color ? color + "22" : "var(--accent-dim)") : "transparent",
  color: active ? (color ?? "var(--accent2)") : "var(--text-muted)",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: "all var(--transition)",
  whiteSpace: "nowrap" as const,
});
const btnPrimary: CSSProperties = {
  background: "linear-gradient(135deg, #7c6fff, #a78bfa)",
  color: "#fff",
  border: "none",
  borderRadius: "var(--radius)",
  padding: "14px 28px",
  fontFamily: "var(--font)",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  transition: "all var(--transition)",
  boxShadow: "0 4px 24px var(--accent-glow)",
  letterSpacing: "0.02em",
};
const btnGhost: CSSProperties = {
  background: "transparent",
  color: "var(--text-muted)",
  border: "1px solid var(--card-border)",
  borderRadius: "var(--radius-sm)",
  padding: "10px 20px",
  fontFamily: "var(--font)",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
  transition: "all var(--transition)",
};

// ─── Onboarding Modal ─────────────────────────────────────────────────────────
function OnboardingModal({ onDone }: { onDone: () => void }) {
  const steps = [
    { icon: "⏱️", title: "Generate Random Times", desc: "Set a time range and generate 1, 3, or 5 random times instantly." },
    { icon: "📅", title: "Save as Tasks", desc: "Add any generated time as a task with notes, category, and priority." },
    { icon: "🔁", title: "Recurring & Reminders", desc: "Set tasks to repeat daily, on weekdays, or weekly." },
  ];
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.8)", backdropFilter: "blur(12px)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div className="animate-scale" style={{
        ...glass,
        borderRadius: 24,
        padding: "48px 40px",
        maxWidth: 480,
        width: "100%",
        textAlign: "center",
        position: "relative",
      }}>
        {/* Logo glow */}
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: "linear-gradient(135deg, #7c6fff, #a78bfa)",
          margin: "0 auto 24px",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36,
          boxShadow: "0 0 40px var(--accent-glow)",
          animation: "pulse-glow 3s ease-in-out infinite",
        }}>⏰</div>
        <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 8, letterSpacing: "-0.02em" }}>
          Welcome to <span style={{ color: "var(--accent2)" }}>RandomTime</span>
        </h1>
        <p style={{ color: "var(--text-muted)", marginBottom: 36, fontSize: 15 }}>
          Generate random times and turn them into scheduled tasks.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 40, textAlign: "left" }}>
          {steps.map((s, i) => (
            <div key={i} style={{
              ...glass,
              borderRadius: "var(--radius)",
              padding: "16px 20px",
              display: "flex", gap: 16, alignItems: "flex-start",
            }}>
              <span style={{ fontSize: 28, lineHeight: 1 }}>{s.icon}</span>
              <div>
                <div style={{ fontWeight: 700, marginBottom: 4 }}>{s.title}</div>
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <button style={{ ...btnPrimary, width: "100%", fontSize: 16, padding: "16px" }} onClick={onDone}>
          Get Started
        </button>
      </div>
    </div>
  );
}

// ─── Task Modal ───────────────────────────────────────────────────────────────
interface TaskModalProps {
  open: boolean;
  hour: number; minute: number; second: number;
  editTask?: Task;
  defaultReminder: number;
  onClose: () => void;
  onSave: (task: Omit<Task, "id" | "createdAt">) => void;
}

function TaskModal({ open, hour, minute, second, editTask, defaultReminder, onClose, onSave }: TaskModalProps) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<TaskCategory | null>(null);
  const [priority, setPriority] = useState<TaskPriority | null>(null);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>("none");
  const [reminderMins, setReminderMins] = useState<number[]>([defaultReminder]);
  const [customMin, setCustomMin] = useState("");
  const [dateStr, setDateStr] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (!open) return;
    if (editTask) {
      setTitle(editTask.title);
      setNotes(editTask.notes ?? "");
      setCategory(editTask.category);
      setPriority(editTask.priority);
      setRecurrence(editTask.recurrence);
      setReminderMins([editTask.reminderMinutes]);
      setDateStr(new Date(editTask.eventDate).toISOString().slice(0, 10));
    } else {
      setTitle(""); setNotes(""); setCategory(null); setPriority(null);
      setRecurrence("none"); setReminderMins([defaultReminder]);
      setCustomMin(""); setDateStr(new Date().toISOString().slice(0, 10));
    }
  }, [open, editTask, defaultReminder]);

  if (!open) return null;

  const effectiveH = editTask ? new Date(editTask.eventDate).getHours() : hour;
  const effectiveM = editTask ? new Date(editTask.eventDate).getMinutes() : minute;
  const effectiveS = editTask ? new Date(editTask.eventDate).getSeconds() : second;

  const allReminders = (() => {
    const set = new Set(reminderMins);
    const p = parseInt(customMin, 10);
    if (!isNaN(p) && p > 0) set.add(p);
    return [...set].sort((a, b) => b - a);
  })();

  const toggleReminder = (m: number) => {
    setReminderMins(prev =>
      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]
    );
  };

  const handleSave = () => {
    const name = title.trim();
    if (!name) return;
    const [y, mo, d] = dateStr.split("-").map(Number);
    const eventDate = new Date(y, mo - 1, d, effectiveH, effectiveM, effectiveS).toISOString();
    onSave({
      title: name,
      eventDate,
      reminderMinutes: allReminders[0] ?? 10,
      status: "pending",
      notes: notes.trim() || null,
      category,
      priority,
      recurrence,
    });
    onClose();
  };

  const REMINDER_OPTS = [5, 10, 15, 30];
  const CATEGORIES: TaskCategory[] = ["Work", "Personal", "Health", "Other"];
  const PRIORITIES: TaskPriority[] = ["High", "Medium", "Low"];
  const RECURRENCES: { value: TaskRecurrence; label: string }[] = [
    { value: "none", label: "Once" },
    { value: "daily", label: "Daily" },
    { value: "weekdays", label: "Weekdays" },
    { value: "weekly", label: "Weekly" },
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 500,
      background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      padding: 0,
    }} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="animate-slide-up" style={{
        ...glass,
        borderRadius: "24px 24px 0 0",
        padding: "32px 28px 40px",
        width: "100%",
        maxWidth: 560,
        maxHeight: "90vh",
        overflowY: "auto",
      }}>
        {/* Handle bar */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--card-border)", margin: "0 auto 28px" }} />
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24, letterSpacing: "-0.01em" }}>
          {editTask ? "Edit Task" : "New Task"}
        </h2>

        {/* Title */}
        <label style={labelStyle}>Task Name</label>
        <input
          autoFocus
          style={{ ...inputStyle, marginBottom: 20 }}
          placeholder="e.g. Team standup"
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSave()}
        />

        {/* Date */}
        <label style={labelStyle}>Date</label>
        <input
          type="date"
          style={{ ...inputStyle, marginBottom: 20, colorScheme: "dark" }}
          value={dateStr}
          onChange={e => setDateStr(e.target.value)}
          min={new Date().toISOString().slice(0, 10)}
        />

        {/* Notes */}
        <label style={labelStyle}>Notes</label>
        <textarea
          style={{ ...inputStyle, minHeight: 72, resize: "vertical", marginBottom: 20, lineHeight: 1.5 }}
          placeholder="Optional note…"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />

        {/* Category */}
        <label style={labelStyle}>Category</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {CATEGORIES.map(c => (
            <button key={c} style={chipStyle(category === c)} onClick={() => setCategory(category === c ? null : c)}>
              {c}
            </button>
          ))}
        </div>

        {/* Priority */}
        <label style={labelStyle}>Priority</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {PRIORITIES.map(p => (
            <button key={p} style={chipStyle(priority === p, priorityColor(p))}
              onClick={() => setPriority(priority === p ? null : p)}>
              {p}
            </button>
          ))}
        </div>

        {/* Recurrence */}
        <label style={labelStyle}>Repeat</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
          {RECURRENCES.map(r => (
            <button key={r.value} style={chipStyle(recurrence === r.value)}
              onClick={() => setRecurrence(r.value)}>
              {r.label}
            </button>
          ))}
        </div>

        {/* Reminder */}
        <label style={labelStyle}>Remind me before</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {REMINDER_OPTS.map(m => (
            <button key={m} style={chipStyle(reminderMins.includes(m))}
              onClick={() => toggleReminder(m)}>
              {m} min
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 28 }}>
          <input
            style={{ ...inputStyle, width: 100 }}
            type="number" min={1} max={999}
            placeholder="Custom"
            value={customMin}
            onChange={e => setCustomMin(e.target.value)}
          />
          <span style={{ color: "var(--text-dim)", fontSize: 13 }}>min custom</span>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          <button style={{ ...btnGhost, flex: 1 }} onClick={onClose}>Cancel</button>
          <button style={{ ...btnPrimary, flex: 2 }} onClick={handleSave} disabled={!title.trim()}>
            {editTask ? "Update Task" : "Save Task"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Task Card ─────────────────────────────────────────────────────────────────
interface TaskCardProps {
  task: Task;
  is24h: boolean;
  selected: boolean;
  onToggleDone: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onShare: () => void;
  onPostpone: () => void;
  onLongPress: () => void;
}

function TaskCard({ task, is24h, selected, onToggleDone, onDelete, onEdit, onShare, onPostpone, onLongPress }: TaskCardProps) {
  const d = new Date(task.eventDate);
  const timeStr = formatTime(d.getHours(), d.getMinutes(), d.getSeconds(), is24h);
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const done = task.status === "done";
  const longRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseDown = () => {
    longRef.current = setTimeout(onLongPress, 600);
  };
  const handleMouseUp = () => {
    if (longRef.current) clearTimeout(longRef.current);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleMouseDown}
      onTouchEnd={handleMouseUp}
      style={{
        ...glass,
        borderRadius: "var(--radius)",
        padding: "16px 18px",
        marginBottom: 10,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
        opacity: done ? 0.6 : 1,
        outline: selected ? "2px solid var(--accent)" : "none",
        outlineOffset: 2,
        transition: "all var(--transition)",
        userSelect: "none" as const,
        cursor: "pointer",
      }}
    >
      {/* Checkbox */}
      <button
        onClick={onToggleDone}
        style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
          border: `2px solid ${done ? "var(--accent)" : "var(--card-border)"}`,
          background: done ? "var(--accent)" : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: "#fff", fontSize: 12, fontWeight: 800,
          transition: "all var(--transition)", marginTop: 2,
        }}
      >
        {done && "✓"}
      </button>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, fontSize: 15, marginBottom: 4,
          textDecoration: done ? "line-through" : "none",
          color: done ? "var(--text-muted)" : "var(--text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{task.title}</div>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: task.category || task.priority ? 8 : 0 }}>
          {dateStr} · <span style={{ fontFamily: "var(--mono)", color: "var(--accent2)" }}>{timeStr}</span>
          {task.recurrence !== "none" && (
            <span style={{
              marginLeft: 8, fontSize: 10, color: "var(--accent)", fontWeight: 700,
              background: "var(--accent-dim)", padding: "2px 6px", borderRadius: 4,
            }}>↻ {task.recurrence}</span>
          )}
        </div>
        {(task.category || task.priority) && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {task.category && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: "var(--text-muted)",
                background: "var(--input-bg)", padding: "2px 8px", borderRadius: 4, border: "1px solid var(--card-border)",
              }}>{task.category}</span>
            )}
            {task.priority && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: priorityColor(task.priority),
                border: `1px solid ${priorityColor(task.priority)}55`,
                padding: "2px 8px", borderRadius: 4,
              }}>{task.priority}</span>
            )}
          </div>
        )}
        {task.notes && (
          <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 6, fontStyle: "italic",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.notes}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        {(["↑", "✎", "↻", "✕"] as const).map((icon, i) => {
          const actions = [onShare, onEdit, onPostpone, onDelete];
          const colors = ["var(--success)", "var(--accent)", "var(--warning)", "var(--danger)"];
          const dims = ["var(--success-dim)", "var(--accent-dim)", "var(--warning-dim)", "var(--danger-dim)"];
          return (
            <button
              key={icon}
              onClick={(e) => { e.stopPropagation(); actions[i](); }}
              title={["Share", "Edit", "Postpone", "Delete"][i]}
              style={{
                width: 30, height: 30, borderRadius: 8,
                border: `1px solid ${colors[i]}44`,
                background: dims[i],
                color: colors[i],
                fontSize: 13, fontWeight: 700, cursor: "pointer",
                transition: "all var(--transition)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >{icon}</button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Time Input ────────────────────────────────────────────────────────────────
function TimeInput({
  label, h, m, s,
  onH, onM, onS,
}: {
  label: string;
  h: string; m: string; s: string;
  onH: (v: string) => void; onM: (v: string) => void; onS: (v: string) => void;
}) {
  const field = (
    val: string,
    onChange: (v: string) => void,
    placeholder: string,
    unit: string
  ) => (
    <div style={{ textAlign: "center" }}>
      <input
        style={{
          ...inputStyle, width: 64, textAlign: "center",
          fontSize: 26, fontWeight: 800, padding: "12px 0",
          fontFamily: "var(--mono)", letterSpacing: "0.05em",
        }}
        type="text"
        inputMode="numeric"
        maxLength={2}
        placeholder={placeholder}
        value={val}
        onChange={e => onChange(e.target.value.replace(/\D/g, ""))}
        onFocus={e => e.target.select()}
      />
      <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 4, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase" }}>{unit}</div>
    </div>
  );

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {field(h, onH, "HH", "hrs")}
        <span style={{ fontSize: 24, color: "var(--accent)", fontWeight: 900, marginBottom: 16 }}>:</span>
        {field(m, onM, "MM", "min")}
        <span style={{ fontSize: 24, color: "var(--accent)", fontWeight: 900, marginBottom: 16 }}>:</span>
        {field(s, onS, "SS", "sec")}
      </div>
    </div>
  );
}

// ─── Stats Card ────────────────────────────────────────────────────────────────
function StatsCard({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div style={{
      ...glass,
      borderRadius: "var(--radius)",
      padding: "20px 16px",
      flex: 1,
      textAlign: "center",
    }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: color ?? "var(--text)", letterSpacing: "-0.02em" }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        {label}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [tasks, setTasks] = useState<Task[]>(loadTasks);

  const [minH, setMinH] = useState(settings.minH);
  const [minM, setMinM] = useState(settings.minM);
  const [minS, setMinS] = useState(settings.minS);
  const [maxH, setMaxH] = useState(settings.maxH);
  const [maxM, setMaxM] = useState(settings.maxM);
  const [maxS, setMaxS] = useState(settings.maxS);

  const [results, setResults] = useState<{ h: number; m: number; s: number }[]>([]);
  const [genCount, setGenCount] = useState<1 | 3 | 5>(1);
  const [activeIdx, setActiveIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copied, setCopied] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | undefined>();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [sortBy, setSortBy] = useState<SortBy>("time");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(!settings.onboarded);

  // Apply theme to root
  useEffect(() => {
    document.documentElement.className = settings.theme === "light" ? "light" : "";
    document.body.style.background = settings.theme === "light" ? "#f0f0fa" : "#07071a";
  }, [settings.theme]);

  // Persist settings
  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  // Persist tasks
  useEffect(() => { saveTasks(tasks); }, [tasks]);

  // Persist range inputs
  useEffect(() => {
    updateSettings({ minH, minM, minS, maxH, maxM, maxS });
  }, [minH, minM, minS, maxH, maxM, maxS, updateSettings]);

  const dismissOnboarding = () => {
    updateSettings({ onboarded: true });
    setShowOnboarding(false);
  };

  // Generate
  const generate = () => {
    const minTotal = timeToSeconds(parseVal(minH, 23), parseVal(minM, 59), parseVal(minS, 59));
    const maxTotal = timeToSeconds(parseVal(maxH, 23), parseVal(maxM, 59), parseVal(maxS, 59));
    if (minTotal > maxTotal) { setError("Min time must be ≤ max time"); setResults([]); return; }
    setError(null);

    const excludedBlocks: { from: number; to: number }[] = [];
    if (settings.excludeSleep) excludedBlocks.push({ from: 22 * 3600, to: 7 * 3600 });
    if (settings.excludeLunch) excludedBlocks.push({ from: 12 * 3600, to: 13 * 3600 });

    const pick = (): number => {
      let totalSeconds: number | null = null;
      if (settings.weightedRandom) {
        const peakFrom = Math.max(minTotal, 9 * 3600);
        const peakTo = Math.min(maxTotal, 17 * 3600);
        if (peakFrom <= peakTo && Math.random() < 0.7) {
          for (let i = 0; i < 50; i++) {
            const t = Math.floor(Math.random() * (peakTo - peakFrom + 1)) + peakFrom;
            if (!isInExcludedBlock(t, excludedBlocks)) { totalSeconds = t; break; }
          }
        }
      }
      if (totalSeconds === null) {
        for (let i = 0; i < 100; i++) {
          const t = Math.floor(Math.random() * (maxTotal - minTotal + 1)) + minTotal;
          if (!isInExcludedBlock(t, excludedBlocks)) { totalSeconds = t; break; }
        }
      }
      return totalSeconds ?? Math.floor(Math.random() * (maxTotal - minTotal + 1)) + minTotal;
    };

    const generated = Array.from({ length: genCount }, () => secondsToTime(pick()));
    setResults(generated);
    setActiveIdx(0);
    setCopied(null);
    if (generated[0]) {
      setHistory(prev => [
        { id: nextId().toString(), ...generated[0] },
        ...prev,
      ].slice(0, 10));
    }
  };

  const copyTime = async (idx: number) => {
    const r = results[idx];
    if (!r) return;
    await navigator.clipboard.writeText(formatTime(r.h, r.m, r.s, settings.is24h));
    setCopied(idx);
    setTimeout(() => setCopied(null), 2000);
  };

  // Tasks
  const saveTask = useCallback((data: Omit<Task, "id" | "createdAt">) => {
    if (editingTask) {
      setTasks(prev => prev.map(t => t.id === editingTask.id
        ? { ...t, ...data } : t
      ));
    } else {
      const newTask: Task = { ...data, id: Date.now(), createdAt: new Date().toISOString() };
      setTasks(prev => [...prev, newTask]);
    }
    setEditingTask(undefined);
  }, [editingTask]);

  const toggleDone = useCallback((task: Task) => {
    const newStatus: TaskStatus = task.status === "done" ? "pending" : "done";
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    if (newStatus === "done" && task.recurrence !== "none") {
      const nextDate = getNextRecurrence(new Date(task.eventDate), task.recurrence);
      const newTask: Task = {
        ...task,
        id: Date.now(),
        status: "pending",
        createdAt: new Date().toISOString(),
        eventDate: nextDate.toISOString(),
      };
      setTasks(prev => [...prev.map(t => t.id === task.id ? { ...t, status: "done" as const } : t), newTask]);
    }
  }, []);

  const deleteTask = useCallback((id: number) => {
    if (confirm("Delete this task?")) {
      setTasks(prev => prev.filter(t => t.id !== id));
      setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }
  }, []);

  const postponeTask = useCallback((task: Task) => {
    const minTotal = timeToSeconds(parseVal(minH, 23), parseVal(minM, 59), parseVal(minS, 59));
    const maxTotal = timeToSeconds(parseVal(maxH, 23), parseVal(maxM, 59), parseVal(maxS, 59));
    const range = Math.max(maxTotal - minTotal, 0);
    const { h, m, s } = secondsToTime(Math.floor(Math.random() * (range + 1)) + minTotal);
    const orig = new Date(task.eventDate);
    const newDate = new Date(orig.getFullYear(), orig.getMonth(), orig.getDate(), h, m, s);
    setTasks(prev => prev.map(t => t.id === task.id
      ? { ...t, eventDate: newDate.toISOString(), status: "pending" } : t
    ));
  }, [minH, minM, minS, maxH, maxM, maxS]);

  const shareTask = useCallback((task: Task) => {
    const d = new Date(task.eventDate);
    const dateStr = d.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
    const timeStr = formatTime(d.getHours(), d.getMinutes(), d.getSeconds(), settings.is24h);
    const lines = [`📅 ${task.title}`, `🕐 ${dateStr} at ${timeStr}`];
    if (task.category) lines.push(`🏷 ${task.category}`);
    if (task.priority) lines.push(`⚡ ${task.priority} priority`);
    if (task.notes) lines.push(`📝 ${task.notes}`);
    if (navigator.share) navigator.share({ text: lines.join("\n") });
    else navigator.clipboard.writeText(lines.join("\n"));
  }, [settings.is24h]);

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "randomtime-tasks.json"; a.click();
    URL.revokeObjectURL(url);
  }, [tasks]);

  const bulkDelete = useCallback(() => {
    if (!selectedIds.size) return;
    if (confirm(`Delete ${selectedIds.size} task(s)?`)) {
      setTasks(prev => prev.filter(t => !selectedIds.has(t.id)));
      setSelectedIds(new Set());
    }
  }, [selectedIds]);

  const deleteAllDone = useCallback(() => {
    if (confirm("Delete all completed tasks?")) {
      setTasks(prev => prev.filter(t => t.status !== "done"));
    }
  }, []);

  const priorityRank = useCallback((p: string | null) => p === "High" ? 0 : p === "Medium" ? 1 : 2, []);

  const displayedTasks = useMemo(() => {
    let list = [...tasks];
    if (filterStatus !== "all") list = list.filter(t => t.status === filterStatus);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(t => t.title.toLowerCase().includes(q) || (t.notes ?? "").toLowerCase().includes(q));
    }
    if (sortBy === "priority") list.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
    else if (sortBy === "created") list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    else list.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    return list;
  }, [tasks, filterStatus, searchQuery, sortBy, priorityRank]);

  const pendingCount = tasks.filter(t => t.status === "pending").length;
  const doneCount = tasks.filter(t => t.status === "done").length;
  const completionPct = tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", position: "relative" }}>
      {/* Background orbs */}
      <div style={{ position: "fixed", inset: 0, overflow: "hidden", zIndex: 0, pointerEvents: "none" }}>
        <div style={{
          position: "absolute", width: 600, height: 600, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(124,111,255,0.12) 0%, transparent 70%)",
          top: -200, left: -200, animation: "float 8s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(167,139,250,0.08) 0%, transparent 70%)",
          bottom: -100, right: -100, animation: "float 10s ease-in-out infinite reverse",
        }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: 680, margin: "0 auto", padding: "32px 20px 80px" }}>

        {/* ── Header ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40 }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.03em", lineHeight: 1.1 }}>
              <span style={{ color: "var(--text)" }}>Random</span>
              <span style={{ color: "var(--accent)" }}>Time</span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 2 }}>
              {pendingCount} pending · {doneCount} done
            </p>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {/* Theme toggle */}
            <button
              onClick={() => updateSettings({ theme: settings.theme === "dark" ? "light" : "dark" })}
              style={{ ...btnGhost, padding: "10px 14px", fontSize: 18 }}
              title="Toggle theme"
            >
              {settings.theme === "dark" ? "☀️" : "🌙"}
            </button>
            {/* Settings */}
            <button
              onClick={() => setSettingsOpen(v => !v)}
              style={{ ...btnGhost, padding: "10px 14px", fontSize: 18 }}
              title="Settings"
            >
              ⚙️
            </button>
          </div>
        </div>

        {/* ── Settings Panel ── */}
        {settingsOpen && (
          <div className="animate-slide-up" style={{ ...glass, borderRadius: "var(--radius)", padding: "24px", marginBottom: 24 }}>
            <h3 style={{ fontWeight: 800, marginBottom: 20, fontSize: 16 }}>Settings</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Time format */}
              <div>
                <label style={labelStyle}>Time Format</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <button style={chipStyle(settings.is24h)} onClick={() => updateSettings({ is24h: true })}>24H</button>
                  <button style={chipStyle(!settings.is24h)} onClick={() => updateSettings({ is24h: false })}>12H</button>
                </div>
              </div>
              {/* Default reminder */}
              <div>
                <label style={labelStyle}>Default Reminder (min)</label>
                <input
                  type="number" min={1} max={999}
                  style={{ ...inputStyle, width: 100 }}
                  value={settings.defaultReminder}
                  onChange={e => updateSettings({ defaultReminder: parseInt(e.target.value, 10) || 10 })}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button style={{ ...btnGhost, fontSize: 13 }} onClick={exportJSON}>
                ↓ Export JSON
              </button>
              <button style={{ ...btnGhost, fontSize: 13, color: "var(--danger)", borderColor: "var(--danger-dim)" }}
                onClick={deleteAllDone}>
                Delete All Done
              </button>
            </div>
          </div>
        )}

        {/* ── Generator Card ── */}
        <div style={{ ...glass, borderRadius: "var(--radius)", padding: "28px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <h2 style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.01em" }}>Time Range</h2>
            <button
              style={{ ...chipStyle(settings.is24h), fontSize: 12 }}
              onClick={() => updateSettings({ is24h: !settings.is24h })}
            >
              {settings.is24h ? "24H" : "12H"}
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
            <TimeInput label="From" h={minH} m={minM} s={minS} onH={setMinH} onM={setMinM} onS={setMinS} />
            <TimeInput label="To" h={maxH} m={maxM} s={maxS} onH={setMaxH} onM={setMaxM} onS={setMaxS} />
          </div>

          {/* Advanced options */}
          <div style={{ borderTop: "1px solid var(--card-border)", paddingTop: 16, marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
              Advanced
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                style={chipStyle(settings.excludeSleep)}
                onClick={() => updateSettings({ excludeSleep: !settings.excludeSleep })}
              >🌙 Skip Sleep</button>
              <button
                style={chipStyle(settings.excludeLunch)}
                onClick={() => updateSettings({ excludeLunch: !settings.excludeLunch })}
              >🥗 Skip Lunch</button>
              <button
                style={chipStyle(settings.weightedRandom)}
                onClick={() => updateSettings({ weightedRandom: !settings.weightedRandom })}
              >⚡ Prefer Work Hours</button>
            </div>
          </div>

          {error && (
            <div style={{
              background: "var(--danger-dim)", border: "1px solid var(--danger)44",
              borderRadius: "var(--radius-sm)", padding: "10px 14px",
              color: "var(--danger)", fontSize: 13, marginBottom: 16,
            }}>{error}</div>
          )}

          {/* Generate row */}
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {([1, 3, 5] as const).map(n => (
              <button
                key={n}
                style={chipStyle(genCount === n)}
                onClick={() => setGenCount(n)}
              >×{n}</button>
            ))}
            <button
              style={{ ...btnPrimary, flex: 1, padding: "14px 20px" }}
              onClick={generate}
            >
              Generate
            </button>
          </div>
        </div>

        {/* ── Results ── */}
        {results.length > 0 && (
          <div className="animate-slide-up" style={{ marginBottom: 20 }}>
            {results.map((r, idx) => (
              <div key={idx} style={{
                ...glass,
                borderRadius: "var(--radius)",
                padding: "24px 28px",
                marginBottom: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
              }}>
                <div>
                  <div style={{
                    fontSize: 11, fontWeight: 700, color: "var(--text-dim)",
                    letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6,
                  }}>
                    {results.length > 1 ? `Time ${idx + 1}` : "Your Random Time"}
                  </div>
                  <div style={{
                    fontSize: 44, fontWeight: 900,
                    fontFamily: "var(--mono)",
                    letterSpacing: "0.04em",
                    background: "linear-gradient(135deg, var(--accent), var(--accent2))",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                    paddingRight: 8,
                    animation: "pulse-glow 3s ease-in-out infinite",
                  }}>
                    {formatTime(r.h, r.m, r.s, settings.is24h)}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <button
                    style={{ ...btnGhost, fontSize: 13, padding: "8px 16px" }}
                    onClick={() => copyTime(idx)}
                  >
                    {copied === idx ? "✓ Copied" : "Copy"}
                  </button>
                  <button
                    style={{ ...btnPrimary, fontSize: 13, padding: "8px 16px", boxShadow: "none" }}
                    onClick={() => { setActiveIdx(idx); setEditingTask(undefined); setModalOpen(true); }}
                  >
                    + Task
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── History ── */}
        {history.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ ...labelStyle, margin: 0 }}>History</span>
              <button style={{ fontSize: 12, color: "var(--danger)", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}
                onClick={() => setHistory([])}>Clear</button>
            </div>
            <div style={{ ...glass, borderRadius: "var(--radius)", overflow: "hidden" }}>
              {history.map((item, i) => (
                <div key={item.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "12px 18px",
                  borderBottom: i < history.length - 1 ? "1px solid var(--card-border)" : "none",
                  background: i === 0 ? "var(--accent-dim)" : "transparent",
                }}>
                  <span style={{ fontSize: 12, color: "var(--text-dim)", fontWeight: 700, width: 28 }}>#{i + 1}</span>
                  <span style={{
                    fontFamily: "var(--mono)", fontSize: 17, fontWeight: 700,
                    color: i === 0 ? "var(--accent2)" : "var(--text-muted)",
                    letterSpacing: "0.08em",
                  }}>
                    {formatTime(item.h, item.m, item.s, settings.is24h)}
                  </span>
                  <button
                    style={{ fontSize: 11, color: "var(--text-dim)", background: "none", border: "1px solid var(--card-border)", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontWeight: 600 }}
                    onClick={() => { setResults([item]); setActiveIdx(0); }}
                  >Use</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Tasks ── */}
        {tasks.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <span style={{ ...labelStyle, margin: 0 }}>Saved Tasks</span>
              {selectedIds.size > 0 && (
                <button style={{ ...btnGhost, padding: "6px 14px", fontSize: 12, color: "var(--danger)", borderColor: "var(--danger-dim)" }}
                  onClick={bulkDelete}>Delete {selectedIds.size}</button>
              )}
            </div>

            {/* Search */}
            <input
              style={{ ...inputStyle, marginBottom: 12 }}
              placeholder="Search tasks…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />

            {/* Filters + Sort */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
              {(["all", "pending", "done"] as FilterStatus[]).map(f => (
                <button key={f} style={chipStyle(filterStatus === f)} onClick={() => setFilterStatus(f)}>
                  {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              {(["time", "priority", "created"] as SortBy[]).map(s => (
                <button key={s} style={{ ...chipStyle(sortBy === s), fontSize: 11 }} onClick={() => setSortBy(s)}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {displayedTasks.length === 0
              ? <div style={{ textAlign: "center", color: "var(--text-dim)", padding: "24px 0", fontSize: 14 }}>No tasks match</div>
              : displayedTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  is24h={settings.is24h}
                  selected={selectedIds.has(task.id)}
                  onToggleDone={() => toggleDone(task)}
                  onDelete={() => deleteTask(task.id)}
                  onEdit={() => { setEditingTask(task); setModalOpen(true); }}
                  onShare={() => shareTask(task)}
                  onPostpone={() => postponeTask(task)}
                  onLongPress={() => setSelectedIds(prev => {
                    const s = new Set(prev);
                    s.has(task.id) ? s.delete(task.id) : s.add(task.id);
                    return s;
                  })}
                />
              ))
            }
          </div>
        )}

        {/* ── Statistics ── */}
        {tasks.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <span style={{ ...labelStyle, display: "block", marginBottom: 12 }}>Statistics</span>
            <div style={{ display: "flex", gap: 12 }}>
              <StatsCard label="Total" value={tasks.length} />
              <StatsCard label="Done" value={doneCount} color="var(--accent2)" />
              <StatsCard label="Pending" value={pendingCount} color="var(--warning)" />
              <StatsCard label="Complete" value={`${completionPct}%`} color="var(--success)" />
            </div>
          </div>
        )}

        {/* ── Empty State ── */}
        {tasks.length === 0 && results.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px" }}>
            <div style={{
              width: 80, height: 80, borderRadius: "50%",
              background: "var(--accent-dim)", margin: "0 auto 20px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 36, animation: "float 4s ease-in-out infinite",
            }}>⏱️</div>
            <p style={{ color: "var(--text-muted)", fontSize: 15, lineHeight: 1.6 }}>
              Generate a random time to get started.<br/>
              <span style={{ color: "var(--text-dim)", fontSize: 13 }}>
                Then add it as a task with reminders.
              </span>
            </p>
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showOnboarding && <OnboardingModal onDone={dismissOnboarding} />}

      <TaskModal
        open={modalOpen}
        hour={results[activeIdx]?.h ?? 0}
        minute={results[activeIdx]?.m ?? 0}
        second={results[activeIdx]?.s ?? 0}
        editTask={editingTask}
        defaultReminder={settings.defaultReminder}
        onClose={() => { setModalOpen(false); setEditingTask(undefined); }}
        onSave={saveTask}
      />
    </div>
  );
}
