/**
 * Phase 12 — Overlay Alarm bridge.
 *
 * JS facade for the native OverlayAlarm module. Follows the same structural
 * pattern as nativeAppControl.ts: lazy cached native lookup, graceful fallback
 * when the module is absent, and test hooks that let unit tests drive the full
 * event path without a real Android module.
 *
 * Public API (default export):
 *   fireOverlayAlarm(taskId, taskTitle) → Promise<{fired:'overlay'|'unavailable'|'permission_denied'}>
 *   dismissOverlayAlarm(taskId)         → Promise<void>
 *   onAlarmAction(listener)             → () => void   (unsubscribe)
 *
 * Named exports:
 *   isOverlayAlarmAvailable()           → boolean
 *   OverlayAlarmAction                  (type)
 *
 * Test hooks (named exports):
 *   __setOverlayAlarmAvailable(v: boolean | null)
 *   __resetOverlayAlarmCache()
 *   __emitOverlayAlarmAction(payload)
 */

// NativeModules / NativeEventEmitter are imported lazily (via require) inside
// getRawNative() and getEmitter() so that Jest / managed Expo / web can load
// this module without triggering react-native native binding side effects.
// This top-level import is type-only — used only for the NativeEventEmitter
// type annotation on _emitter.
import type { NativeEventEmitter as NativeEventEmitterType } from "react-native";

// ---------------------------------------------------------------------------
// Public type
// ---------------------------------------------------------------------------

/** The payload delivered to onAlarmAction listeners. */
export type OverlayAlarmAction = {
  taskId: string;
  action: "done" | "postpone" | "reroll";
};

// ---------------------------------------------------------------------------
// Internal types for the raw native module
// ---------------------------------------------------------------------------

interface RawNativeOverlayAlarm {
  fireOverlayAlarm(taskId: string, taskTitle: string): Promise<void>;
  dismissOverlayAlarm(taskId: string): Promise<void>;
  addListener(eventName: string): void;
  removeListeners(count: number): void;
}

// ---------------------------------------------------------------------------
// Availability + cache
// ---------------------------------------------------------------------------

let _availabilityOverride: boolean | null = null;

let _nativeCache: { resolved: boolean; value: RawNativeOverlayAlarm | null } =
  { resolved: false, value: null };

/**
 * Best-effort lookup of NativeModules.OverlayAlarm. Returns null when the
 * native module isn't installed (managed Expo, web, Jest, build flavors that
 * don't include the module, etc.).
 *
 * Cached on first call — same pattern as nativeAppControl.ts `getRawNative`.
 */
function getRawNative(): RawNativeOverlayAlarm | null {
  if (_nativeCache.resolved) {
    return _nativeCache.value;
  }
  let resolved: RawNativeOverlayAlarm | null = null;
  try {
    // Dynamic require so Jest / managed Expo / web can run without pulling
    // react-native's native binding side effects.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RN = require("react-native");
    const mod = RN?.NativeModules?.OverlayAlarm;
    if (mod && typeof mod.fireOverlayAlarm === "function") {
      resolved = mod as RawNativeOverlayAlarm;
    }
  } catch {
    // require() can throw on platforms where react-native isn't loadable.
    // Swallow and fall through to null.
  }
  _nativeCache = { resolved: true, value: resolved };
  return resolved;
}

/**
 * Whether the real native OverlayAlarm module is wired in.
 *
 * Returns true on Android device builds where OverlayAlarmModule is
 * registered, and false on managed Expo, web, Jest, and build flavors that
 * don't include the module.
 *
 * Tests can override via __setOverlayAlarmAvailable(true|false|null).
 */
export function isOverlayAlarmAvailable(): boolean {
  if (_availabilityOverride != null) return _availabilityOverride;
  return getRawNative() != null;
}

/** Test-only: force the availability flag. Pass null to clear the override. */
export function __setOverlayAlarmAvailable(value: boolean | null): void {
  _availabilityOverride = value;
}

/** Test-only: clear the cached native-module lookup so the next call re-probes. */
export function __resetOverlayAlarmCache(): void {
  _nativeCache = { resolved: false, value: null };
}

// ---------------------------------------------------------------------------
// Fallback-warn guard (warn once when module is absent)
// ---------------------------------------------------------------------------

let _warnedUnavailable = false;

function warnUnavailable(method: string): void {
  if (!_warnedUnavailable) {
    _warnedUnavailable = true;
    console.warn(
      `[overlayAlarmBridge] Native OverlayAlarm module is not available. ` +
        `'${method}' is a no-op on this platform/build.`
    );
  }
}

// ---------------------------------------------------------------------------
// Internal listener set — used when native module is absent (test path)
// ---------------------------------------------------------------------------

type ActionListener = (payload: OverlayAlarmAction) => void;
const _fallbackListeners: Set<ActionListener> = new Set();

/** Test-only: fire an alarm action through the internal listener set (no native module needed). */
export function __emitOverlayAlarmAction(payload: OverlayAlarmAction): void {
  _fallbackListeners.forEach((l) => l(payload));
}

// ---------------------------------------------------------------------------
// NativeEventEmitter singleton (only created when the module is present)
// ---------------------------------------------------------------------------

let _emitter: NativeEventEmitterType | null = null;

function getEmitter(): NativeEventEmitterType | null {
  const native = getRawNative();
  if (!native) return null;
  if (!_emitter) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NativeEventEmitter, NativeModules } = require("react-native") as typeof import("react-native");
    _emitter = new NativeEventEmitter(NativeModules.OverlayAlarm);
  }
  return _emitter;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Show the overlay alarm for the given task.
 *
 * Returns:
 *   { fired: 'overlay' }           — native module fired successfully
 *   { fired: 'unavailable' }       — native module absent; no-op
 *   { fired: 'permission_denied' } — native module rejected with ERR_OVERLAY_NOT_GRANTED
 */
async function fireOverlayAlarm(
  taskId: string,
  taskTitle: string
): Promise<{ fired: "overlay" | "unavailable" | "permission_denied" }> {
  const native = getRawNative();
  if (!native) {
    warnUnavailable("fireOverlayAlarm");
    return { fired: "unavailable" };
  }
  try {
    await native.fireOverlayAlarm(taskId, taskTitle);
    return { fired: "overlay" };
  } catch (err: unknown) {
    // Check for permission denial from the native side.
    if (
      err != null &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code: unknown }).code === "ERR_OVERLAY_NOT_GRANTED"
    ) {
      return { fired: "permission_denied" };
    }
    throw err;
  }
}

/**
 * Dismiss the overlay alarm for the given task.
 *
 * No-op (with one-time console.warn) when the native module is absent.
 */
async function dismissOverlayAlarm(taskId: string): Promise<void> {
  const native = getRawNative();
  if (!native) {
    warnUnavailable("dismissOverlayAlarm");
    return;
  }
  await native.dismissOverlayAlarm(taskId);
}

/**
 * Subscribe to alarm-action events (done / postpone / reroll).
 *
 * When the native module is present: wraps NativeEventEmitter.addListener.
 * When absent: subscribes to an internal listener set that
 * __emitOverlayAlarmAction can drive — so tests work without a real module.
 *
 * Returns an unsubscribe function.
 */
function onAlarmAction(listener: (payload: OverlayAlarmAction) => void): () => void {
  const emitter = getEmitter();
  if (emitter) {
    const subscription = emitter.addListener("overlayAlarmAction", listener);
    return () => subscription.remove();
  }
  // Native module absent — use fallback listener set (test / preview path).
  _fallbackListeners.add(listener);
  return () => {
    _fallbackListeners.delete(listener);
  };
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

const overlayAlarmBridge = {
  fireOverlayAlarm,
  dismissOverlayAlarm,
  onAlarmAction,
};

export default overlayAlarmBridge;
