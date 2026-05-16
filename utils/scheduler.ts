/**
 * Phase 10 — Surprise-Me scheduler.
 *
 * Given a pool of pending tasks and a time window, pick N tasks and assign
 * each a new event_date scattered across that window using the weighted
 * random engine (so work/lunch/sleep bias is honoured).
 *
 * This module is PURE — it does not touch the DB or the notification
 * subsystem. The caller applies the returned plan (cancel old notifications,
 * schedule new ones, persist) so that all side effects remain in App.tsx
 * and can be mocked out in tests.
 */

import {
  generateWeightedRandom,
  type WeightedRange,
  type ExcludedBlock,
} from "../weightedRandom";

export interface ScatterPlanItem {
  taskId: number;
  /** New event date, as ISO string (local-time equivalent). */
  newEventDateIso: string;
}

export interface ScatterInput {
  /**
   * Tasks eligible for re-scheduling. Caller is expected to pre-filter this
   * (e.g. only `status === 'pending'`).
   */
  pendingTasks: { id: number; event_date: string }[];
  /** Number of tasks to pick. Clamped to `pendingTasks.length`. */
  count: number;
  /** Reference date — determines which calendar day the tasks land on. */
  today: Date;
  /** Bottom of window in seconds-of-day (0..86399). */
  minSeconds: number;
  /** Top of window in seconds-of-day (0..86399). */
  maxSeconds: number;
  weights: WeightedRange[];
  excluded: ExcludedBlock[];
}

/**
 * Fisher-Yates shuffle — used to pick N random tasks without replacement.
 * Returns a new array; does not mutate the input.
 */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Produce a scatter plan: N random pending tasks, each assigned a new
 * random time within [minSeconds, maxSeconds] on `today` (honouring
 * weights and excluded blocks).
 *
 * If count > pendingTasks.length, all tasks get rescheduled.
 */
export function planSurpriseMe(input: ScatterInput): ScatterPlanItem[] {
  const {
    pendingTasks,
    count,
    today,
    minSeconds,
    maxSeconds,
    weights,
    excluded,
  } = input;

  if (pendingTasks.length === 0 || count <= 0) return [];

  const n = Math.min(count, pendingTasks.length);
  const picks = shuffle(pendingTasks).slice(0, n);

  const plan: ScatterPlanItem[] = [];
  for (const task of picks) {
    const whenSeconds = generateWeightedRandom(
      minSeconds,
      maxSeconds,
      weights,
      excluded
    );
    const h = Math.floor(whenSeconds / 3600);
    const m = Math.floor((whenSeconds % 3600) / 60);
    const s = whenSeconds % 60;
    const newDate = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      h,
      m,
      s
    );
    plan.push({
      taskId: task.id,
      newEventDateIso: newDate.toISOString(),
    });
  }
  return plan;
}

/**
 * Convert the current "energy level" setting into a sensible N for surprise-me.
 * Low energy → fewer nudges; High energy → more.
 *
 * Intentionally conservative on Low — the whole point of asking is that the
 * user is telling us their bandwidth is limited.
 */
export type EnergyLevel = "low" | "medium" | "high";

export function nudgeCountForEnergy(level: EnergyLevel | null): number {
  if (level === "low") return 1;
  if (level === "high") return 5;
  // medium or unset → 3
  return 3;
}
