/**
 * Phase 11 — App Control facade.
 *
 * One module the JS layer imports for everything app-control. Today it
 * dispatches to an in-memory mock (so we can write the UI and tests before
 * the Kotlin module exists). After `npx expo prebuild` lands and
 * `AppControlModule.kt` is written, the only change here is the body of
 * `getImpl()` — swap the mock for `NativeModules.AppControl` (plus event
 * subscriptions via `NativeEventEmitter`).
 *
 * `isAppControlAvailable()` lets the UI gracefully hide blocker affordances
 * when running on:
 *   - managed Expo (no native module) — `false`
 *   - the `playStoreLite` build flavor (Play Store, no blocker) — also `false`
 *   - the `sideloadFull` build flavor — `true`
 *
 * Until prebuild lands, `available` is hard-coded to false and the mock is
 * used purely for tests / Storybook-style preview.
 */

import type {
  AppControlNative,
  BlockedAppLaunchedEvent,
  FocusSession,
  FocusSessionHandle,
  ForegroundAppChangedEvent,
  InstalledApp,
  PermissionStatus,
  UsageRow,
} from "./types/appControl";

// ---------------------------------------------------------------------------
// Availability flag.
// ---------------------------------------------------------------------------

let _availabilityOverride: boolean | null = null;

/**
 * Whether the real native module is wired in. Today: always false (managed Expo).
 * After Phase 11.0 prebuild + Phase 11.3 sideload flavor: true when
 * `BuildConfig.HAS_BLOCKER === true` and `NativeModules.AppControl` exists.
 *
 * Tests can override via `__setAppControlAvailable(true|false|null)`.
 */
export function isAppControlAvailable(): boolean {
  if (_availabilityOverride != null) return _availabilityOverride;
  // TODO(phase-11.0): swap for `NativeModules.AppControl != null` once the
  // module is wired. Keep behind a try/catch — accessing a missing native
  // module name throws synchronously on some RN versions.
  return false;
}

/** Test-only: force the availability flag. Pass null to clear the override. */
export function __setAppControlAvailable(value: boolean | null): void {
  _availabilityOverride = value;
}

// ---------------------------------------------------------------------------
// In-memory mock — single source of truth until the Kotlin module ships.
// ---------------------------------------------------------------------------

type Listener<T> = (e: T) => void;

interface MockState {
  installedApps: InstalledApp[];
  usageRows: UsageRow[];
  permissions: PermissionStatus;
  activeSession: FocusSession | null;
  nextSessionId: number;
  foregroundListeners: Set<Listener<ForegroundAppChangedEvent>>;
  blockedListeners: Set<Listener<BlockedAppLaunchedEvent>>;
}

function makeInitialState(): MockState {
  return {
    installedApps: [
      {
        packageName: "com.instagram.android",
        label: "Instagram",
        iconBase64: null,
        isLauncher: true,
        isSystem: false,
      },
      {
        packageName: "com.zhiliaoapp.musically",
        label: "TikTok",
        iconBase64: null,
        isLauncher: true,
        isSystem: false,
      },
      {
        packageName: "com.google.android.youtube",
        label: "YouTube",
        iconBase64: null,
        isLauncher: true,
        isSystem: false,
      },
      {
        packageName: "com.reddit.frontpage",
        label: "Reddit",
        iconBase64: null,
        isLauncher: true,
        isSystem: false,
      },
    ],
    usageRows: [],
    permissions: { usageStats: false, overlay: false, accessibility: false },
    activeSession: null,
    nextSessionId: 1,
    foregroundListeners: new Set(),
    blockedListeners: new Set(),
  };
}

let state: MockState = makeInitialState();

/** Test-only: reset the mock state between cases. */
export function __resetAppControlMock(): void {
  state = makeInitialState();
}

/** Test-only: stuff a permission value into the mock. */
export function __setMockPermissions(p: Partial<PermissionStatus>): void {
  state.permissions = { ...state.permissions, ...p };
}

/** Test-only: stuff usage rows into the mock. */
export function __setMockUsageRows(rows: UsageRow[]): void {
  state.usageRows = rows;
}

/** Test-only: emit a foreground-app-changed event from the mock. */
export function __emitForegroundAppChanged(
  e: ForegroundAppChangedEvent
): void {
  state.foregroundListeners.forEach((l) => l(e));
  if (
    state.activeSession &&
    state.activeSession.endedAt == null &&
    state.activeSession.blockedPackages.includes(e.packageName)
  ) {
    const evt: BlockedAppLaunchedEvent = {
      packageName: e.packageName,
      sessionId: state.activeSession.id,
      timestampMs: e.timestampMs,
    };
    state.blockedListeners.forEach((l) => l(evt));
  }
}

const mockImpl: AppControlNative = {
  async getInstalledApps(opts) {
    const launcherOnly = opts?.launcherOnly ?? true;
    return state.installedApps.filter(
      (a) => (!launcherOnly || a.isLauncher) && !a.isSystem
    );
  },

  async getUsageStats(_sinceMs) {
    return [...state.usageRows];
  },

  async getPermissionStatus() {
    return { ...state.permissions };
  },

  async requestUsageStatsPermission() {
    // In real life this deep-links to ACTION_USAGE_ACCESS_SETTINGS.
    // The mock just flips the permission so tests can drive permission flows.
    state.permissions.usageStats = true;
  },
  async requestOverlayPermission() {
    state.permissions.overlay = true;
  },
  async requestAccessibilityPermission() {
    state.permissions.accessibility = true;
  },

  async startFocusSession(opts) {
    if (state.activeSession && state.activeSession.endedAt == null) {
      throw new Error(
        "A focus session is already active. End it before starting a new one."
      );
    }
    const now = Date.now();
    const session: FocusSession = {
      id: state.nextSessionId++,
      startTs: now,
      endTs: now + opts.durationMinutes * 60 * 1000,
      endedAt: null,
      blockedPackages: [...opts.blockedPackages],
      emergencyUnlocks: 0,
      source: opts.source,
      endReason: null,
    };
    state.activeSession = session;
    return { sessionId: session.id };
  },

  async endFocusSession(handle, reason) {
    if (!state.activeSession || state.activeSession.id !== handle.sessionId) {
      return;
    }
    state.activeSession = {
      ...state.activeSession,
      endedAt: Date.now(),
      endReason: reason,
    };
  },

  async getActiveSession() {
    if (!state.activeSession || state.activeSession.endedAt != null) {
      return null;
    }
    return { ...state.activeSession, blockedPackages: [...state.activeSession.blockedPackages] };
  },

  async useEmergencyUnlock(handle) {
    if (!state.activeSession || state.activeSession.id !== handle.sessionId) {
      throw new Error("Session not active");
    }
    state.activeSession = {
      ...state.activeSession,
      emergencyUnlocks: state.activeSession.emergencyUnlocks + 1,
    };
    return state.activeSession.emergencyUnlocks;
  },

  onForegroundAppChanged(listener) {
    state.foregroundListeners.add(listener);
    return () => {
      state.foregroundListeners.delete(listener);
    };
  },

  onBlockedAppLaunched(listener) {
    state.blockedListeners.add(listener);
    return () => {
      state.blockedListeners.delete(listener);
    };
  },
};

// ---------------------------------------------------------------------------
// Public facade.
// ---------------------------------------------------------------------------

function getImpl(): AppControlNative {
  // TODO(phase-11.0): after prebuild, route to NativeModules.AppControl when
  // isAppControlAvailable() is true. Until then, mock is the only impl.
  return mockImpl;
}

const nativeAppControl: AppControlNative = {
  getInstalledApps: (opts) => getImpl().getInstalledApps(opts),
  getUsageStats: (sinceMs) => getImpl().getUsageStats(sinceMs),
  getPermissionStatus: () => getImpl().getPermissionStatus(),
  requestUsageStatsPermission: () => getImpl().requestUsageStatsPermission(),
  requestOverlayPermission: () => getImpl().requestOverlayPermission(),
  requestAccessibilityPermission: () => getImpl().requestAccessibilityPermission(),
  startFocusSession: (opts) => getImpl().startFocusSession(opts),
  endFocusSession: (h, r) => getImpl().endFocusSession(h, r),
  getActiveSession: () => getImpl().getActiveSession(),
  useEmergencyUnlock: (h) => getImpl().useEmergencyUnlock(h),
  onForegroundAppChanged: (l) => getImpl().onForegroundAppChanged(l),
  onBlockedAppLaunched: (l) => getImpl().onBlockedAppLaunched(l),
};

export default nativeAppControl;
