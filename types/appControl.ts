/**
 * Phase 11 — App Control native module contract.
 *
 * This file describes the shape of the Kotlin `AppControlModule` that will
 * land after `npx expo prebuild`. Today there is no native code — the
 * companion `nativeAppControl.ts` dispatches to an in-memory mock so the
 * JS layer can be written and tested against the contract before the
 * Kotlin module exists.
 *
 * Keep this file pure types (no runtime code). When the native module
 * ships, the only thing that changes is `nativeAppControl.ts` swapping
 * its mock for `NativeModules.AppControl`.
 */

/** An app installed on the device. Populated from PackageManager. */
export interface InstalledApp {
  /** Stable identifier, e.g. "com.instagram.android". */
  packageName: string;
  /** Human-readable label, e.g. "Instagram". */
  label: string;
  /** Base64-encoded PNG icon, or null if unavailable. */
  iconBase64: string | null;
  /** True iff Android has flagged this as a launchable app the user could open from the launcher. */
  isLauncher: boolean;
  /** True iff this is a system app (we usually filter these out of the picker). */
  isSystem: boolean;
}

/** One usage stats row aggregated over the query window. */
export interface UsageRow {
  packageName: string;
  /** Seconds the app was foreground in the queried window. */
  foregroundSeconds: number;
  /** Last time the app was used (ms since epoch), or 0 if never in the window. */
  lastTimeUsedMs: number;
}

/** Coarse permission status. Granted = `true`; not granted = `false`. */
export interface PermissionStatus {
  /** PACKAGE_USAGE_STATS — required for foreground detection + usage rows. */
  usageStats: boolean;
  /** SYSTEM_ALERT_WINDOW — required to draw the blocker overlay. */
  overlay: boolean;
  /** BIND_ACCESSIBILITY_SERVICE — required for real-time foreground monitoring + blocking. */
  accessibility: boolean;
}

/** Why a focus session ended. */
export type FocusSessionEndReason =
  | "completed" // ran to planned end
  | "user_ended" // user tapped "end session"
  | "emergency_unlock" // user spent an emergency unlock (different from ending)
  | "crashed"; // service died unexpectedly

/** How a focus session was initiated. */
export type FocusSessionSource =
  | "manual" // user tapped "Start focus session"
  | "task" // auto-started by a saved task firing
  | "schedule" // recurring schedule
  | "surprise_me"; // Surprise Me task scatter

/** A focus session as stored in the DB / served by the native module. */
export interface FocusSession {
  /** SQLite rowid. */
  id: number;
  /** Wall-clock start (ms since epoch). */
  startTs: number;
  /** Planned end (ms since epoch). */
  endTs: number;
  /** Actual end (ms since epoch), null while running. */
  endedAt: number | null;
  /** Package names blocked during this session. */
  blockedPackages: string[];
  /** Number of emergency unlocks used. */
  emergencyUnlocks: number;
  /** What started this session. */
  source: FocusSessionSource;
  /** Why it ended, null while running. */
  endReason: FocusSessionEndReason | null;
}

/** A handle returned by `startFocusSession` for later end/extend calls. */
export interface FocusSessionHandle {
  sessionId: number;
}

/** Event payload when the foreground app changes. Emitted by the accessibility service. */
export interface ForegroundAppChangedEvent {
  packageName: string;
  timestampMs: number;
}

/** Event payload when a blocked app is launched during an active session. */
export interface BlockedAppLaunchedEvent {
  packageName: string;
  /** sessionId currently active. */
  sessionId: number;
  timestampMs: number;
}

/**
 * The full surface exposed by the Kotlin native module.
 *
 * In production this is implemented by `NativeModules.AppControl`. In
 * managed Expo (today) and in tests, it's implemented by a mock.
 */
export interface AppControlNative {
  // ─── App listing ────────────────────────────────────────────────────────
  /** List installed apps. `launcherOnly = true` filters to launcher apps. */
  getInstalledApps(opts?: { launcherOnly?: boolean }): Promise<InstalledApp[]>;

  // ─── Usage stats ────────────────────────────────────────────────────────
  /** Rows for apps used in the window [sinceMs, now]. */
  getUsageStats(sinceMs: number): Promise<UsageRow[]>;

  // ─── Permissions ────────────────────────────────────────────────────────
  getPermissionStatus(): Promise<PermissionStatus>;
  requestUsageStatsPermission(): Promise<void>;
  requestOverlayPermission(): Promise<void>;
  requestAccessibilityPermission(): Promise<void>;

  // ─── Focus sessions ─────────────────────────────────────────────────────
  startFocusSession(opts: {
    blockedPackages: string[];
    durationMinutes: number;
    source: FocusSessionSource;
  }): Promise<FocusSessionHandle>;
  endFocusSession(
    handle: FocusSessionHandle,
    reason: FocusSessionEndReason
  ): Promise<void>;
  /** Returns the currently-active session, or null. */
  getActiveSession(): Promise<FocusSession | null>;
  /** Use an emergency unlock — bumps the counter, returns the new total. */
  useEmergencyUnlock(handle: FocusSessionHandle): Promise<number>;

  // ─── Events ─────────────────────────────────────────────────────────────
  /** Subscribe to foreground-app changes. Returns an unsubscribe function. */
  onForegroundAppChanged(
    listener: (e: ForegroundAppChangedEvent) => void
  ): () => void;
  /** Subscribe to blocked-app-launch events. Returns an unsubscribe function. */
  onBlockedAppLaunched(
    listener: (e: BlockedAppLaunchedEvent) => void
  ): () => void;
}

/**
 * Build-flavor flag. In `playStoreLite` this is `false` and any UI that
 * advertises "blocking" should be hidden / replaced with the soft-limit
 * notification flow. In `sideloadFull` this is `true`.
 *
 * Read from `expo-constants` (`Constants.expoConfig?.extra?.hasBlocker`)
 * once we set up product flavors. For now it's hard-wired in the mock.
 */
export const HAS_BLOCKER_FLAG_KEY = "hasBlocker" as const;
