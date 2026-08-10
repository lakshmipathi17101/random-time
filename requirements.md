# Phase 12 — Standalone Android Overlay Alarms

## Goal

Replace the expo-notifications alarm tier with a native Android foreground service that
fires a floating overlay window (TYPE_APPLICATION_OVERLAY) when a task alarm is due.
The overlay shows three action buttons — **Done**, **Postpone**, **Re-roll** — which the
user taps to dismiss without opening the app. This makes reminders feel like a proper
Android alarm, not a tray notification.

## Context and current state

- The app is already a bare Expo workflow (`android/` present from Phase 11.0 prebuild).
- Phase 11.1 added `AppControlModule.kt` (permission status + Settings deep-links) and the
  `SYSTEM_ALERT_WINDOW` / `PACKAGE_USAGE_STATS` permissions in `AndroidManifest.xml`.
- `notificationService.ts` schedules reminders via `expo-notifications` in three tiers:
  - `scheduleGentleNudge` — silent pre-nudge 5 min before (keep as-is)
  - `scheduleReminder` — standard channel reminder (keep as-is)
  - `scheduleAlarm` — MAX-importance alarm at exact time (REPLACE with overlay service)
- `nativeAppControl.ts` is the JS facade over `AppControlModule`; the same pattern will be
  used for the new overlay alarm module.
- `SYSTEM_ALERT_WINDOW` (`canDrawOverlays`) permission is already declared and the bridge
  to request it exists.

## What must be built

### 1. Kotlin: `OverlayAlarmService.kt` (foreground service)

A `Service` (`START_STICKY`) that:
- Receives an `ACTION_FIRE_OVERLAY` intent with extras: `taskId`, `taskTitle`
- Posts a foreground notification in its own notification channel (`overlay_alarm_service`)
  to keep Android from killing it (required since Android 8)
- Draws a `WindowManager` overlay window (`TYPE_APPLICATION_OVERLAY`, `FLAG_NOT_FOCUSABLE |
  FLAG_LAYOUT_IN_SCREEN | FLAG_KEEP_SCREEN_ON`) containing:
  - Task title label
  - Three buttons: **Done** · **Postpone** · **Re-roll**
- On any button tap: sends a local broadcast with the action chosen + taskId, then calls
  `stopSelf()` and removes the window
- On `ACTION_DISMISS_OVERLAY` intent: removes the window silently (used by the JS layer
  when the task is handled elsewhere)

### 2. Kotlin: `OverlayAlarmModule.kt` (React Native bridge)

Extends `ReactContextBaseJavaModule`, exposes two methods to JS:

```
fireOverlayAlarm(taskId: String, taskTitle: String)
dismissOverlayAlarm(taskId: String)
```

`fireOverlayAlarm` checks `canDrawOverlays`; if false, falls back to a standard
MAX-importance notification (graceful degradation). If true, starts `OverlayAlarmService`
via an intent with the appropriate extras.

`dismissOverlayAlarm` sends `ACTION_DISMISS_OVERLAY` to the running service.

Also exposes a JS event emitter for the user's button selection:
`overlayAlarmAction` event with payload `{ taskId, action: 'done'|'postpone'|'reroll' }`.

### 3. Register in `MainApplication.kt` and `AndroidManifest.xml`

- Add `OverlayAlarmPackage` to the package list in `MainApplication.kt`.
- Declare `OverlayAlarmService` in `AndroidManifest.xml` with:
  - `android:foregroundServiceType="specialUse"` (Android 14+)
  - `android:permission="android.permission.FOREGROUND_SERVICE"`
  - `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_SPECIAL_USE` permission declarations
  - `POST_NOTIFICATIONS` permission declaration (Android 13+)

### 4. TypeScript: `overlayAlarmBridge.ts`

A thin JS facade (same pattern as `nativeAppControl.ts`) that:
- Checks `NativeModules.OverlayAlarm` availability
- Exposes `fireOverlayAlarm(taskId, taskTitle)` and `dismissOverlayAlarm(taskId)`
- Subscribes to the `overlayAlarmAction` event and re-emits it through an
  `EventEmitter`-style API
- Falls back gracefully (no-op + console.warn) when the native module is absent (Expo Go,
  tests, web)

### 5. Wire into `notificationService.ts`

- Replace the body of `scheduleAlarm()` with a call to
  `overlayAlarmBridge.fireOverlayAlarm(taskId, title)` when the native module is available.
- Keep the existing `expo-notifications` path as the fallback when the bridge is absent
  (preserves Expo Go / CI compatibility).
- The JS response handler (`setupNotificationResponseHandler`) already handles Done/Postpone/
  Re-roll; extend it to also listen on `overlayAlarmBridge.onAlarmAction()` so both paths
  funnel into the same task-state update logic.

### 6. Permission gate in `App.tsx`

On first launch (or when `SYSTEM_ALERT_WINDOW` is not yet granted), show a one-time prompt
card explaining why the overlay permission is needed and offering a button that calls
`requestOverlayPermission()` (already in `nativeAppControl.ts`). If denied, the app falls
back silently to the existing notification path — no crash, no repeated pestering.

### 7. Tests

- Unit tests for `overlayAlarmBridge.ts`: mock module present/absent, check fallback path.
- Unit test for the permission gate logic: granted → `fireOverlayAlarm` called; denied →
  `scheduleAlarm` notification fallback called.

## Risk and constraints

- `TYPE_APPLICATION_OVERLAY` is blocked by Android's battery-optimisation screen on some
  OEMs (Xiaomi MIUI, OPPO ColorOS). Graceful degradation to the notification path handles
  this.
- `FOREGROUND_SERVICE_SPECIAL_USE` requires a Play Store declaration that the app uses it
  for alarms/reminders. This is fully legitimate for a reminder app.
- Android 14 requires `foregroundServiceType` to be declared; without it the service crashes
  on start. Must be in the manifest.
- The overlay must not steal input focus (it's `FLAG_NOT_FOCUSABLE`) to avoid blocking the
  user from interacting with whatever is on screen underneath.
- Tests must mock `NativeModules.OverlayAlarm`; no Kotlin unit tests are required (the
  Kotlin layer is thin wiring).

## Definition of done

- `OverlayAlarmService.kt`, `OverlayAlarmModule.kt`, `OverlayAlarmPackage.kt` committed.
- `overlayAlarmBridge.ts` committed with fallback path.
- `notificationService.ts` routes `scheduleAlarm` through the bridge when available.
- `App.tsx` shows the permission prompt card on first launch.
- `AndroidManifest.xml` declares service + permissions.
- `MainApplication.kt` registers the package.
- `npx tsc --noEmit` passes.
- All existing tests still pass; new bridge tests pass.
