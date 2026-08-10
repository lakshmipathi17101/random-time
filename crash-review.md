# Phase 12 Overlay Alarm — Crash & Stability Review

Branch: `feat/phase-12-overlay-alarms`
Worktree: `E:\E-Will\random-time-wt\phase-12`
Base: `main`

## Files reviewed (from `git diff main...feat/phase-12-overlay-alarms --name-only`)

- `E:\E-Will\random-time-wt\phase-12\App.tsx`
- `E:\E-Will\random-time-wt\phase-12\notificationService.ts`
- `E:\E-Will\random-time-wt\phase-12\overlayAlarmBridge.ts`
- `E:\E-Will\random-time-wt\phase-12\db.ts`
- `E:\E-Will\random-time-wt\phase-12\CHANGELOG.md`
- `E:\E-Will\random-time-wt\phase-12\docs\phase-12-overlay-alarms.md`
- `E:\E-Will\random-time-wt\phase-12\android\app\src\main\AndroidManifest.xml`
- `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\MainApplication.kt`
- `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\overlayalarm\AlarmReceiver.kt`
- `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\overlayalarm\OverlayAlarmModule.kt`
- `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\overlayalarm\OverlayAlarmPackage.kt`
- `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\overlayalarm\OverlayAlarmService.kt`
- `E:\E-Will\random-time-wt\phase-12\__tests__\notificationService.test.ts`
- `E:\E-Will\random-time-wt\phase-12\__tests__\overlayAlarmBridge.test.ts`

Manifest indicates Expo SDK 52 default (minSdk 24, target ≥ 34). All API-guarded logic must assume 24+.

---

## Risks found

### 1) Foreground service started from background BroadcastReceiver via `startService()` — will crash on API 26+ (Android 8+)

**FILE**: `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\overlayalarm\AlarmReceiver.kt`
**RISK**: When the AlarmManager fires while the app is in the background (the primary use case), `context.startService(...)` throws `IllegalStateException: Not allowed to start service Intent … app is in background` on Android 8+. The service in question is a foreground service that calls `startForeground()` in `onStartCommand`, so it MUST be launched via `ContextCompat.startForegroundService(...)` (or `context.startForegroundService()` on API 26+). AlarmManager broadcasts get a short-lived foreground allowlist to launch FGS, but only if you use the foreground-service launcher.
**SEVERITY**: CRASH
**FIX**: Replace line 28 with:
```kotlin
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    context.startForegroundService(serviceIntent)
} else {
    context.startService(serviceIntent)
}
```
(add `import android.os.Build`). Also, the service must then call `startForeground()` within ~5 seconds of `onStartCommand` — the current code already does this for `ACTION_FIRE_OVERLAY`, but note that if `ACTION_DISMISS_OVERLAY` is received while the service isn't already promoted, the same crash-then-ANR path applies; see item 3.

---

### 2) `OverlayAlarmModule.fireOverlayAlarm` / `dismissOverlayAlarm` use `startService()` on a foreground service — same background-start crash

**FILE**: `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\overlayalarm\OverlayAlarmModule.kt`
**RISK**: Lines 109 (`reactContext.startService(intent)` inside `fireOverlayAlarm`) and 123 (same inside `dismissOverlayAlarm`) will throw `IllegalStateException` on API 26+ if the JS caller invokes them while the RN activity is not in the resumed/foreground state (e.g., in-response to an overlay button tap that arrives via a background broadcast, or if JS chooses to fire the overlay from a background task later). The safe launcher for a foreground service is `ContextCompat.startForegroundService()`.
**SEVERITY**: LIKELY_CRASH
**FIX**: In both `fireOverlayAlarm` and `dismissOverlayAlarm`, replace the `reactContext.startService(intent)` call with:
```kotlin
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
    ContextCompat.startForegroundService(reactContext, intent)
} else {
    reactContext.startService(intent)
}
```
(add `import androidx.core.content.ContextCompat` and `import android.os.Build`).

---

### 3) `ACTION_DISMISS_OVERLAY` may reach `onStartCommand` without `startForeground()` ever being called — ANR / ForegroundServiceDidNotStartInTimeException on API 26+

**FILE**: `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\overlayalarm\OverlayAlarmService.kt`
**RISK**: `onStartCommand` (lines 59–74) only calls `startForegroundCompat()` in the `ACTION_FIRE_OVERLAY` branch. If the service was launched with `startForegroundService(ACTION_DISMISS_OVERLAY)` (which is the required launcher after fix #2), Android will kill the process with `ForegroundServiceDidNotStartInTimeException` because the system was told to expect a foreground service but none was promoted. Additionally, an unknown/null `intent.action` (which happens when a service is restarted by the system for `START_STICKY` — irrelevant here since we return `START_NOT_STICKY`, but still possible when redelivery is off) falls through to `return START_NOT_STICKY` without ever calling `startForeground`, hitting the same crash.
**SEVERITY**: LIKELY_CRASH
**FIX**: Always promote to foreground before branching, then decide what to do:
```kotlin
override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // Promote to foreground unconditionally so we satisfy the FGS-start contract
    // regardless of which action arrives (or if the OS restarts us with a null intent).
    startForegroundCompat()
    when (intent?.action) {
        ACTION_FIRE_OVERLAY -> {
            val taskId = intent.getStringExtra(EXTRA_TASK_ID) ?: ""
            val taskTitle = intent.getStringExtra(EXTRA_TASK_TITLE) ?: ""
            showOverlay(taskId, taskTitle)
        }
        ACTION_DISMISS_OVERLAY -> {
            removeOverlay()
            stopSelf()
        }
        else -> stopSelf()
    }
    return START_NOT_STICKY
}
```

---

### 4) `WindowManager.addView` can throw `BadTokenException` / `WindowManager.BadTokenException` if `SYSTEM_ALERT_WINDOW` was revoked between scheduling and firing

**FILE**: `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\overlayalarm\OverlayAlarmService.kt`
**RISK**: `showOverlay()` (lines 128–163) calls `wm.addView(card, params)` without a try/catch. The user may have granted overlay permission at schedule time but revoked it by the time AlarmReceiver fires; also, `TYPE_APPLICATION_OVERLAY` can be refused by OEM battery-optimization screens (Xiaomi MIUI, OPPO ColorOS — noted in the design doc). In those cases `addView` throws `WindowManager.BadTokenException` and the foreground service crashes.
**SEVERITY**: LIKELY_CRASH
**FIX**: Wrap the `wm.addView(card, params)` call in a try/catch, log, and `stopSelf()` on failure so the service tears down cleanly and expo-notifications remains the fallback:
```kotlin
try {
    wm.addView(card, params)
    overlayView = card
} catch (e: Exception) {
    android.util.Log.w("OverlayAlarmService", "Failed to add overlay view", e)
    overlayView = null
    stopSelf()
    return
}
```
(Also swap the current `overlayView = card` line above so it is only set on success.)

---

### 5) `Settings.canDrawOverlays` gate in `scheduleOverlayAlarm` is checked at schedule time only — user can revoke permission before fire, then AlarmReceiver runs with no gate

**FILE**: `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\overlayalarm\AlarmReceiver.kt`
**RISK**: `AlarmReceiver.onReceive` (lines 17–30) unconditionally starts `OverlayAlarmService` without re-checking `Settings.canDrawOverlays(context)`. Combined with risk #4, revoked permission leads to a service that will crash on `addView`. Even with fix #4, launching a foreground service just to have it stopSelf() burns battery and posts a brief notification.
**SEVERITY**: POSSIBLE_CRASH
**FIX**: Gate at the top of `onReceive`:
```kotlin
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M &&
    !android.provider.Settings.canDrawOverlays(context)) {
    // Permission revoked between schedule and fire — expo-notifications
    // fallback (already scheduled) will still deliver the alarm.
    return
}
```

---

### 6) `_emitter` singleton in `overlayAlarmBridge.ts` is never invalidated — stale reference if native module hot-reloads

**FILE**: `E:\E-Will\random-time-wt\phase-12\overlayAlarmBridge.ts`
**RISK**: `getEmitter()` (lines 167–176) caches `_emitter` on the module scope. `__resetOverlayAlarmCache()` clears `_nativeCache` but does NOT reset `_emitter`. After a hot reload / test reset, the emitter still points at the old NativeModules.OverlayAlarm and future `addListener` calls dispatch nowhere. Not a runtime crash, but silent breakage in tests / dev reloads.
**SEVERITY**: MINOR
**FIX**: In `__resetOverlayAlarmCache`, also null out `_emitter`:
```typescript
export function __resetOverlayAlarmCache(): void {
  _nativeCache = { resolved: false, value: null };
  _emitter = null;
}
```

---

### 7) `notificationService.scheduleAlarm` — overlay bridge error path swallows all errors, but expo-notifications call itself can still throw and bypass the fallback

**FILE**: `E:\E-Will\random-time-wt\phase-12\notificationService.ts`
**RISK**: `scheduleAlarm` (lines 130–177) awaits `Notifications.scheduleNotificationAsync(...)` first (line 140). If expo-notifications throws (e.g., permission revoked mid-session, storage full, invalid trigger date), the overlay bridge scheduling block below never runs, and the caller sees an unhandled promise rejection. The overlay bridge block itself is correctly wrapped in try/catch. This is a pre-existing behavior but was worth flagging — the doc claims "the overlay is an additive layer — if anything in the native path fails, the user still gets the standard alarm notification," but the inverse (if expo-notifications fails, the overlay does not fire either) is also true and undocumented.
**SEVERITY**: MINOR
**FIX**: Not required for Phase 12 ship. If desired, wrap the expo-notifications call in its own try/catch so the overlay path still fires even when expo-notifications is unhappy. Alternative: leave as-is and document.

---

### 8) `App.tsx` — `hasDismissedOverlayGate` render check does not guard against `appControl.permissions` being `null` while permission actually granted (harmless race, but worth noting)

**FILE**: `E:\E-Will\random-time-wt\phase-12\App.tsx`
**RISK**: The gate card at lines 1129–1170 renders when `appControl.permissions?.overlay === false`. During the initial mount before `useAppControl` finishes its first query, `permissions` is `null` (see `useAppControl.ts` line 68) so the card correctly does not render. However, the transition-detection effect at lines 650–661 stores `prev = prevOverlayGrantedRef.current` and then immediately overwrites it with the new value; if `granted === null` the effect early-returns without updating the ref. That is correct behavior. No crash risk found in this block.
**SEVERITY**: MINOR (informational only — no fix required)
**FIX**: None.

---

### 9) `OverlayAlarmModule.invalidate()` and `onHostDestroy()` both call `LocalBroadcastManager.unregisterReceiver` — double unregister

**FILE**: `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\overlayalarm\OverlayAlarmModule.kt`
**RISK**: Lines 77 and 87 both call `LocalBroadcastManager.getInstance(reactContext).unregisterReceiver(alarmActionReceiver)`. When both fire (host destroy → invalidate), the second call is a no-op on `LocalBroadcastManager` (unlike `Context.unregisterReceiver`, which would throw `IllegalArgumentException`), so no crash. However, if the order is ever reversed (`invalidate()` is called by RN before `onHostDestroy()`), no re-registration ever happens, so the module goes silent for the rest of the process lifetime.
**SEVERITY**: MINOR
**FIX**: Track registration state and only unregister once, or remove the `onHostDestroy()` unregister (invalidate() is sufficient):
```kotlin
override fun onHostDestroy() = Unit  // invalidate() handles cleanup
```

---

### 10) Unused imports in `OverlayAlarmService.kt` — `BroadcastReceiver`, `IntentFilter`

**FILE**: `E:\E-Will\random-time-wt\phase-12\android\app\src\main\java\com\anonymous\randomtime\overlayalarm\OverlayAlarmService.kt`
**RISK**: Lines 7 and 10 import `BroadcastReceiver` and `IntentFilter` but neither is referenced in the file. Not a crash; may trigger a lint warning; suggests the service was originally planned to register a receiver that got moved to the module.
**SEVERITY**: MINOR
**FIX**: Remove lines 7 and 10.

---

## API-level checks — verification

- **Overlay type**: `TYPE_APPLICATION_OVERLAY` (API 26+) correctly wrapped with `Build.VERSION.SDK_INT >= Build.VERSION_CODES.O` fallback to deprecated `TYPE_PHONE`. OK.
- **`AlarmManager.setExactAndAllowWhileIdle`**: added in API 23; project minSdk is 24 (Expo SDK 52 default), so no guard strictly needed, but the code correctly guards at API 23 as extra safety. OK.
- **`canScheduleExactAlarms`**: correctly guarded at API 31+ (`Build.VERSION_CODES.S`). OK.
- **`Settings.canDrawOverlays`**: added in API 23; project minSdk ≥ 24. OK.
- **`FOREGROUND_SERVICE_TYPE_SPECIAL_USE`**: correctly guarded at API 34+ (`UPSIDE_DOWN_CAKE`). OK.
- **`PendingIntent.FLAG_IMMUTABLE`**: correctly guarded at API 23+. OK.
- **`hasActiveReactInstance`**: correct RN 0.74+ replacement for `hasActiveCatalystInstance`. OK.

## Notification / notification channel

- Foreground notification is created and posted BEFORE `WindowManager.addView` on the `ACTION_FIRE_OVERLAY` path. OK.
- Notification channel created with `IMPORTANCE_LOW` before first `startForeground`. OK.
- Manifest declares `POST_NOTIFICATIONS` (API 33+ runtime permission — note: it is NOT requested anywhere in Phase 12 code; the foreground-service notification will be posted but silently suppressed if the user denied POST_NOTIFICATIONS. That is safe — the service still runs — but the ongoing FGS notification will not be visible. Not a crash.)

## TypeScript layer

- `overlayAlarmBridge.ts` — lazy require pattern correct; native module absence path returns typed no-ops; promise rejection paths mapped to `permission_denied` correctly. No unhandled rejections.
- `notificationService.ts` — overlay bridge call correctly wrapped in try/catch; return value of expo-notifications preserved.
- `App.tsx` — `setupOverlayAlarmResponseHandler` cleanup returned and combined with `cleanupNotif` correctly; `useEffect` deps list includes the reschedule-dependent values.

## Thread-safety

- All WindowManager operations run in `OverlayAlarmService.onStartCommand` / `onDestroy` / button click handlers — all main thread. OK.
- `AlarmReceiver.onReceive` runs on main thread. OK.
- `OverlayAlarmModule` `@ReactMethod` calls run on the RN native-modules thread, but `startService` / `Settings.canDrawOverlays` / `AlarmManager` are thread-safe from any thread. OK.

## Memory leaks

- `OverlayAlarmService.overlayView` is nulled in `removeOverlay()`; `onDestroy` calls `removeOverlay()`. OK.
- `OverlayAlarmModule.alarmActionReceiver` is registered in `initialize()`, unregistered in `invalidate()`. OK (aside from the double-unregister note in risk #9).
- `overlayAlarmBridge._fallbackListeners` — subscribers must call the returned unsubscribe fn; App.tsx does. OK.

---

## Verdict

**NEEDS_FIXES**

At least one CRASH (risk #1: `AlarmReceiver` uses `startService` on a foreground service — will throw `IllegalStateException` on Android 8+ when the alarm fires with the app in the background, i.e., the entire intended use case) and three LIKELY_CRASH items (risks #2, #3, #4) were found. The overlay alarm chain will not work reliably on the target platform (Android 8+, effectively all supported devices) until these are addressed.

The TypeScript bridge, the App.tsx integration, and the test coverage are all clean and follow the existing project patterns. All defects are on the Android side and are focused in three files:

- `AlarmReceiver.kt` — fix #1, #5
- `OverlayAlarmModule.kt` — fix #2, #9 (minor)
- `OverlayAlarmService.kt` — fix #3, #4, #10 (minor)

Priority order to unblock ship: **#1 → #3 → #2 → #4 → #5**.

---

## Crash-fix review

APPROVED

Reviewed commit: `9165ac2c` — "fix(phase-12): four crash fixes — startForegroundService, unconditional FGS start, BadTokenException guard"
Task: `random-time-dyp.15`
Jest: 185/185 tests pass (9 suites, 0 failures)

### Fix 1 — AlarmReceiver uses ContextCompat.startForegroundService

PASS. `AlarmReceiver.kt` line 28: `context.startService(serviceIntent)` replaced with `ContextCompat.startForegroundService(context, serviceIntent)`. The `androidx.core.content.ContextCompat` import is present. Resolves the CRASH (risk #1) where the alarm fired in background on Android 8+ and hit `IllegalStateException`.

### Fix 2 — OverlayAlarmModule both methods use ContextCompat.startForegroundService

PASS. Both `fireOverlayAlarm` (was line 109) and `dismissOverlayAlarm` (was line 123) in `OverlayAlarmModule.kt` now call `ContextCompat.startForegroundService(reactContext, intent)`. The `ContextCompat` import is present. Resolves LIKELY_CRASH (risk #2).

### Fix 3 — OverlayAlarmService.onStartCommand calls startForegroundCompat() BEFORE the when(action) branch

PASS. `startForegroundCompat()` is now the first statement in `onStartCommand`, before the `when (intent?.action)` block. The previous placement inside only the `ACTION_FIRE_OVERLAY` branch meant `ACTION_DISMISS_OVERLAY` deliveries — and any null-intent OS restart — could leave the FGS contract unfulfilled and trigger `ForegroundServiceDidNotStartInTimeException`. Resolves LIKELY_CRASH (risk #3).

### Fix 4 — OverlayAlarmService.showOverlay() has try/catch around wm.addView() with removeView + stopSelf on failure

PASS. `wm.addView(card, params)` is wrapped in a try/catch block. On exception: (a) a nested try/catch attempts `wm.removeView(card)` to avoid a window-leak; (b) `overlayView` is set to `null` to release the local reference; (c) `stopSelf()` tears the service down cleanly. Note: `overlayView = card` is assigned before the try (pre-existing placement), but the catch correctly nulls it so no stale reference remains on failure. Resolves LIKELY_CRASH (risk #4).
