/**
 * Phase 11 — useAppControl hook.
 *
 * Thin React layer around `nativeAppControl` for the permission flow.
 * Components import this hook to read permission state, kick off the
 * "open Settings" deep-links, and conditionally render UI only when
 * the underlying native module is wired up.
 *
 * Scope today (11.1):
 *   - Permission status (usageStats, overlay, accessibility)
 *   - Manual + auto refresh (on mount, on AppState foreground re-entry)
 *   - Per-permission request helpers
 *   - `isAvailable` flag for hiding blocker UI on managed Expo /
 *     `playStoreLite` builds
 *
 * Out of scope today:
 *   - Focus session state (11.3)
 *   - Installed-app list / usage stats (11.2)
 *
 * Testing note: This hook is intentionally a thin shim around
 * `nativeAppControl`, which is fully unit-tested. We don't have
 * `@testing-library/react-native` installed yet, so direct hook tests
 * are deferred to when that dependency lands (11.2+). Until then the
 * hook is verified via on-device manual test in 11.1.
 *
 * Auto-refresh on AppState foreground:
 *   When the user is sent to Settings to grant a permission, the app
 *   goes background. When they return, AppState transitions back to
 *   "active" and we re-query — surfacing the new permission state in
 *   the UI without the user having to manually refresh.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import nativeAppControl, {
  isAppControlAvailable,
} from "../nativeAppControl";
import type { PermissionStatus } from "../types/appControl";

export const DENIED_ALL: PermissionStatus = {
  usageStats: false,
  overlay: false,
  accessibility: false,
};

export interface UseAppControlResult {
  /** True iff the native module is wired (false on managed Expo / web / jest). */
  isAvailable: boolean;
  /** Most-recent permission status. `null` until the first query lands. */
  permissions: PermissionStatus | null;
  /** True while the initial / a manual refresh is in flight. */
  loading: boolean;
  /** Last error from a permission query or request, if any. */
  error: Error | null;
  /** Force a re-query of permission state. */
  refresh: () => Promise<void>;
  /** Open Settings → Usage Access for this app. Refreshes on resume. */
  requestUsageStats: () => Promise<void>;
  /** Open Settings → Display over other apps for this app. Refreshes on resume. */
  requestOverlay: () => Promise<void>;
  /** Open Settings → Accessibility (general list). Refreshes on resume. */
  requestAccessibility: () => Promise<void>;
}

export function useAppControl(): UseAppControlResult {
  const available = isAppControlAvailable();
  const [permissions, setPermissions] = useState<PermissionStatus | null>(
    available ? null : DENIED_ALL
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const mountedRef = useRef(true);

  const safeSet = useCallback(<T,>(setter: (v: T) => void, value: T) => {
    if (mountedRef.current) setter(value);
  }, []);

  const refresh = useCallback(async () => {
    if (!available) {
      safeSet(setPermissions, DENIED_ALL);
      return;
    }
    safeSet(setLoading, true);
    safeSet(setError, null);
    try {
      const status = await nativeAppControl.getPermissionStatus();
      safeSet(setPermissions, status);
    } catch (e) {
      safeSet(setError, e instanceof Error ? e : new Error(String(e)));
    } finally {
      safeSet(setLoading, false);
    }
  }, [available, safeSet]);

  // Initial load + AppState listener.
  //
  // Track previous AppState so we only refresh on a background→active
  // transition. Without this we'd double-refresh on launch (mount call +
  // initial "active" event) and on every transient state change. The
  // intended trigger is "user returned from Settings", which is always a
  // background→active hop.
  const lastStateRef = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    mountedRef.current = true;
    refresh();
    const onChange = (next: AppStateStatus) => {
      const prev = lastStateRef.current;
      lastStateRef.current = next;
      if (next === "active" && prev !== "active") refresh();
    };
    const sub = AppState.addEventListener("change", onChange);
    return () => {
      mountedRef.current = false;
      sub.remove();
    };
  }, [refresh]);

  // Permission-request helpers. We deliberately do *not* refresh after
  // `fn()` returns — the AppState listener (above) will refresh when the
  // user returns from Settings, and refreshing here too would double-call.
  // We do refresh on error path so error → cleared-error state is visible.
  const wrapRequest = useCallback(
    (
      fn: () => Promise<void>
    ): (() => Promise<void>) =>
      async () => {
        safeSet(setError, null);
        try {
          await fn();
        } catch (e) {
          safeSet(setError, e instanceof Error ? e : new Error(String(e)));
          await refresh();
        }
      },
    [refresh, safeSet]
  );

  const requestUsageStats = useMemo(
    () => wrapRequest(() => nativeAppControl.requestUsageStatsPermission()),
    [wrapRequest]
  );
  const requestOverlay = useMemo(
    () => wrapRequest(() => nativeAppControl.requestOverlayPermission()),
    [wrapRequest]
  );
  const requestAccessibility = useMemo(
    () => wrapRequest(() => nativeAppControl.requestAccessibilityPermission()),
    [wrapRequest]
  );

  return {
    isAvailable: available,
    permissions,
    loading,
    error,
    refresh,
    requestUsageStats,
    requestOverlay,
    requestAccessibility,
  };
}
