/**
 * Phase 11 — Focus-session pure logic.
 *
 * "Should I block this package right now? When does this end? Can the
 * user spend another emergency unlock?" — all answered from data alone,
 * no DB, no native module, no React. Pure functions of the inputs.
 *
 * Lives outside `nativeAppControl` so the accessibility service (Kotlin)
 * and the JS UI can agree on the same rules without one having to call
 * the other for trivial decisions.
 */

import type { FocusSession } from "../types/appControl";

/** Default cooldown between emergency unlocks within a single session. */
export const DEFAULT_EMERGENCY_UNLOCK_COOLDOWN_MS = 5 * 60 * 1000;

/** Default cap on emergency unlocks per session. 0 = unlimited. */
export const DEFAULT_EMERGENCY_UNLOCK_CAP = 3;

/** Optional config — UI layer can override these from settings. */
export interface EmergencyUnlockPolicy {
  /** Ms between consecutive unlocks. */
  cooldownMs: number;
  /** Max unlocks per session. 0 = unlimited. */
  perSessionCap: number;
}

export const DEFAULT_EMERGENCY_UNLOCK_POLICY: EmergencyUnlockPolicy = {
  cooldownMs: DEFAULT_EMERGENCY_UNLOCK_COOLDOWN_MS,
  perSessionCap: DEFAULT_EMERGENCY_UNLOCK_CAP,
};

/**
 * Has the session's planned end already passed?
 *
 * "Active" = not yet ended AND now < endTs. A session whose planned end has
 * passed but hasn't been explicitly ended is conceptually expired — the
 * accessibility service should stop blocking once it notices.
 */
export function isExpired(session: FocusSession, nowMs: number): boolean {
  if (session.endedAt != null) return true;
  return nowMs >= session.endTs;
}

/**
 * True iff the session is currently active for blocking purposes:
 * - Not yet explicitly ended
 * - Planned end has not yet passed
 */
export function isActive(session: FocusSession, nowMs: number): boolean {
  return session.endedAt == null && nowMs < session.endTs;
}

/**
 * Should `packageName` be blocked right now under `session`?
 *
 * Block iff:
 *   1. The session is currently active (not ended, not expired).
 *   2. `packageName` appears in the session's blocked list.
 *
 * The session does not implicitly block apps that aren't listed. We deliberately
 * support an empty `blockedPackages` array (= "this is just a tracking session,
 * block nothing") so the same session abstraction can be reused for
 * Pomodoro-style countdowns without blocking anything.
 */
export function isPackageBlocked(
  session: FocusSession,
  packageName: string,
  nowMs: number
): boolean {
  if (!isActive(session, nowMs)) return false;
  return session.blockedPackages.includes(packageName);
}

/** Milliseconds remaining in the session, clamped to >= 0. */
export function timeRemainingMs(session: FocusSession, nowMs: number): number {
  if (session.endedAt != null) return 0;
  return Math.max(0, session.endTs - nowMs);
}

/** Helper for UI countdown labels. Returns whole seconds. */
export function timeRemainingSeconds(
  session: FocusSession,
  nowMs: number
): number {
  return Math.floor(timeRemainingMs(session, nowMs) / 1000);
}

/**
 * Can the user spend an emergency unlock right now?
 *
 * Rules:
 *   - Session must be active. (You can't unlock something that isn't running.)
 *   - If `perSessionCap > 0`, must not have hit the cap.
 *   - Must have waited `cooldownMs` since the last unlock if there was one.
 *
 * `lastUnlockAtMs` is null if no unlock has been used yet in this session.
 */
export function canEmergencyUnlock(
  session: FocusSession,
  nowMs: number,
  lastUnlockAtMs: number | null,
  policy: EmergencyUnlockPolicy = DEFAULT_EMERGENCY_UNLOCK_POLICY
): { allowed: boolean; reason?: string; nextAllowedAtMs?: number } {
  if (!isActive(session, nowMs)) {
    return { allowed: false, reason: "session_inactive" };
  }
  if (
    policy.perSessionCap > 0 &&
    session.emergencyUnlocks >= policy.perSessionCap
  ) {
    return { allowed: false, reason: "cap_reached" };
  }
  if (lastUnlockAtMs != null) {
    const earliestNext = lastUnlockAtMs + policy.cooldownMs;
    if (nowMs < earliestNext) {
      return {
        allowed: false,
        reason: "cooldown",
        nextAllowedAtMs: earliestNext,
      };
    }
  }
  return { allowed: true };
}

/**
 * Convenience — pretty countdown label.
 *
 *   59  -> "59 sec"
 *   60  -> "1:00"
 *   125 -> "2:05"
 *   3725 -> "62:05"
 *
 * Keeps the 1-min boundary `"sec"` form so very-short waits feel different.
 */
export function formatRemaining(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0 sec";
  if (totalSeconds < 60) return `${Math.floor(totalSeconds)} sec`;
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Build the FocusSession shape the native module will persist when the user
 * starts a session. Splitting this out so the JS UI can preview what's about
 * to be created (e.g. "this will block 4 apps until 14:32") before actually
 * starting it.
 */
export function makePendingSession(input: {
  startMs: number;
  durationMinutes: number;
  blockedPackages: string[];
  source: FocusSession["source"];
}): Omit<FocusSession, "id"> {
  return {
    startTs: input.startMs,
    endTs: input.startMs + Math.max(0, input.durationMinutes) * 60 * 1000,
    endedAt: null,
    blockedPackages: [...input.blockedPackages], // defensive copy
    emergencyUnlocks: 0,
    source: input.source,
    endReason: null,
  };
}
