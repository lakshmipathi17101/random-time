import * as SQLite from "expo-sqlite";

export interface Task {
  id: number;
  title: string;
  event_date: string;
  reminder_minutes: number;
  alarm_notification_id: string | null;
  reminder_notification_id: string | null;
  calendar_event_id: string | null;
  created_at: string;
}

export type SettingKey =
  | "is24h"
  | "min_h"
  | "min_m"
  | "min_s"
  | "max_h"
  | "max_m"
  | "max_s";

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
  `);

  return _db;
}

export async function insertTask(
  task: Omit<Task, "id" | "created_at">
): Promise<number> {
  const db = await getDb();
  const result = await db.runAsync(
    `INSERT INTO tasks
       (title, event_date, reminder_minutes,
        alarm_notification_id, reminder_notification_id,
        calendar_event_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    task.title,
    task.event_date,
    task.reminder_minutes,
    task.alarm_notification_id ?? null,
    task.reminder_notification_id ?? null,
    task.calendar_event_id ?? null,
    new Date().toISOString()
  );
  return result.lastInsertRowId;
}

export async function getTasks(): Promise<Task[]> {
  const db = await getDb();
  return db.getAllAsync<Task>(`SELECT * FROM tasks ORDER BY event_date ASC`);
}

export async function deleteTask(id: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(`DELETE FROM tasks WHERE id = ?`, id);
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
