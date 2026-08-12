/**
 * Phase 14 — app icon badge count.
 *
 * Pure, testable badge-count logic, kept out of React and out of the
 * notification layer.
 */

import type { Task } from "../db";

/** Local-midnight Date for day-level comparisons (matches streak.ts's dayKey convention). */
function localDayStart(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Counts tasks that are `pending` AND whose `event_date` falls on the same
 * local calendar day as `now`, or strictly earlier (overdue).
 *
 * - `done` tasks are never counted.
 * - Tasks scheduled for a future local day are never counted.
 * - Tasks with an unparseable/empty `event_date` are skipped, not thrown on.
 * - Never returns a negative number.
 */
export function computeBadgeCount(
  tasks: Pick<Task, "status" | "event_date">[],
  now: Date = new Date()
): number {
  const today = localDayStart(now);
  let count = 0;

  for (const task of tasks) {
    if (task.status !== "pending") continue;
    if (!task.event_date) continue;

    const parsed = new Date(task.event_date);
    if (Number.isNaN(parsed.getTime())) continue;

    const taskDay = localDayStart(parsed);
    if (taskDay.getTime() <= today.getTime()) {
      count++;
    }
  }

  return Math.max(0, count);
}
