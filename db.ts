import * as SQLite from "expo-sqlite";

export type TaskCategory = "Work" | "Personal" | "Health" | "Other";
export type TaskPriority = "High" | "Medium" | "Low";
export type RecurrenceType = "none" | "daily" | "weekly" | "custom";

export interface WeightedRange {
  id: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
  weight: number;
}

export interface ExcludedBlock {
  id: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
}

export interface Preset {
  id: number;
  name: string;
  config_json: string; // JSON: { minH, minM, minS, maxH, maxM, maxS, weights, excluded }
}

export interface PresetConfig {
  minH: string;
  minM: string;
  minS: string;
  maxH: string;
  maxM: string;
  maxS: string;
  weights: WeightedRange[];
  excluded: ExcludedBlock[];
}

export interface Task {
  id: number;
  title: string;
  event_date: string;
  reminder_minutes: number;
  alarm_notification_id: string | null;
  reminder_notification_id: string | null;
  /** JSON array of notification IDs, one per reminder offset */
  reminder_notification_ids: string | null;
  calendar_event_id: string | null;
  created_at: string;
  status: "pending" | "done";
  notes: string | null;
  category: TaskCategory | null;
  priority: TaskPriority | null;
  recurrence_type: RecurrenceType | null;
  recurrence_interval: number | null;
}

export type SettingKey =
  | "is24h"
  | "min_h"
  | "min_m"
  | "min_s"
  | "max_h"
  | "max_m"
  | "max_s"
  | "default_reminder"
  | "onboarding_complete"
  | "weighted_ranges"
  | "excluded_blocks";

let _db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;

  _db = await SQLite.openDatabaseAsync("randomtime.db");

  await _db.execAsync(`PRAGMA journal_mode = WAL;`);

  await _db.execAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      title                    TEXT    NOT NULL,
      event_date               TEXT    NOT NULL,
      reminder_minutes         INTEGER NOT NULL,
      alarm_notification_id    TEXT,
      reminder_notification_id TEXT,
      calendar_event_id        TEXT,
      created_at               TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS presets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      config_json TEXT NOT NULL
    );
  `);

  // Migrations: add new columns if they don't exist yet
  const migrations = [
    `ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`,
    `ALTER TABLE tasks ADD COLUMN notes TEXT`,
    `ALTER TABLE tasks ADD COLUMN reminder_notification_ids TEXT`,
    `ALTER TABLE tasks ADD COLUMN category TEXT`,
    `ALTER TABLE tasks ADD COLUMN priority TEXT`,
    `ALTER TABLE tasks ADD COLUMN recurrence_type TEXT`,
    `ALTER TABLE tasks ADD COLUMN recurrence_interval INTEGER`,
  ];
  for (const sql of migrations) {
    try {
      await _db.execAsync(sql);
    } catch {
      // Column already exists — safe to ignore
    }
  }

  return _db;
}

export async function insertTask(
  task: Omit<Task, "id" | "created_at" | "status" | "notes" | "reminder_notification_ids" | "category" | "priority" | "recurrence_type" | "recurrence_interval"> & {
    notes?: string | null;
    reminder_notification_ids?: string | null;
    category?: TaskCategory | null;
    priority?: TaskPriority | null;
    recurrence_type?: RecurrenceType | null;
    recurrence_interval?: number | null;
  }
): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO tasks
       (title, event_date, reminder_minutes,
        alarm_notification_id, reminder_notification_id,
        reminder_notification_ids, calendar_event_id, created_at, status, notes, category, priority,
        recurrence_type, recurrence_interval)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`,
    task.title,
    task.event_date,
    task.reminder_minutes,
    task.alarm_notification_id ?? null,
    task.reminder_notification_id ?? null,
    task.reminder_notification_ids ?? null,
    task.calendar_event_id ?? null,
    new Date().toISOString(),
    task.notes ?? null,
    task.category ?? null,
    task.priority ?? null,
    task.recurrence_type ?? null,
    task.recurrence_interval ?? null
  );
  return result.lastInsertRowId;
}

export async function updateTaskStatus(
  id: number,
  status: "pending" | "done"
): Promise<void> {
  const db = await getDb();
  await db.runAsync(`UPDATE tasks SET status = ? WHERE id = ?`, status, id);
}

export async function updateTask(
  id: number,
  fields: {
    title: string;
    event_date: string;
    reminder_minutes: number;
    notes: string | null;
    alarm_notification_id: string | null;
    reminder_notification_id: string | null;
    reminder_notification_ids?: string | null;
    category?: TaskCategory | null;
    priority?: TaskPriority | null;
    recurrence_type?: RecurrenceType | null;
    recurrence_interval?: number | null;
  }
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE tasks
     SET title = ?, event_date = ?, reminder_minutes = ?, notes = ?,
         alarm_notification_id = ?, reminder_notification_id = ?,
         reminder_notification_ids = ?, category = ?, priority = ?,
         recurrence_type = ?, recurrence_interval = ?
     WHERE id = ?`,
    fields.title,
    fields.event_date,
    fields.reminder_minutes,
    fields.notes,
    fields.alarm_notification_id,
    fields.reminder_notification_id,
    fields.reminder_notification_ids ?? null,
    fields.category ?? null,
    fields.priority ?? null,
    fields.recurrence_type ?? null,
    fields.recurrence_interval ?? null,
    id
  );
}

export async function updateTaskTime(
  id: number,
  event_date: string,
  alarm_notification_id: string | null,
  reminder_notification_id: string | null
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `UPDATE tasks
     SET event_date = ?, alarm_notification_id = ?, reminder_notification_id = ?, status = 'pending'
     WHERE id = ?`,
    event_date,
    alarm_notification_id,
    reminder_notification_id,
    id
  );
}

export async function getTasks(): Promise<Task[]> {
  const db = await getDb();
  return db.getAllAsync<Task>(`SELECT * FROM tasks ORDER BY event_date ASC`);
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM tasks WHERE id = ?`, id);
}

export async function getDoneTasks(): Promise<Task[]> {
  const db = await getDb();
  return db.getAllAsync<Task>(`SELECT * FROM tasks WHERE status = 'done'`);
}

export async function getSetting(key: SettingKey): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM settings WHERE key = ?`,
    key
  );
  return row?.value ?? null;
}

export async function upsertSetting(
  key: SettingKey,
  value: string
): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value
  );
}

// Preset CRUD

export async function getPresets(): Promise<Preset[]> {
  const db = await getDb();
  return db.getAllAsync<Preset>(`SELECT * FROM presets ORDER BY id ASC`);
}

export async function insertPreset(name: string, config: PresetConfig): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO presets (name, config_json) VALUES (?, ?)`,
    name,
    JSON.stringify(config)
  );
  return result.lastInsertRowId;
}

export async function deletePreset(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM presets WHERE id = ?`, id);
}
