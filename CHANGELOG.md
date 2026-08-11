# Changelog

## Phase 12 — Overlay Alarms (2026-08-10)

**Sprint goal:** Replace the expo-notifications alarm tier with a native Android
foreground service that draws a `TYPE_APPLICATION_OVERLAY` floating card when a
task alarm fires, letting the user respond (Done / Postpone / Re-roll) without
opening the app.

**What was added:**

- `OverlayAlarmService.kt` — foreground service that draws a native
  `WindowManager` overlay card with three action buttons; uses
  `START_NOT_STICKY` (one-shot); posts its own foreground notification on the
  `overlay_alarm_service` channel to satisfy Android 8+ requirements
- `AlarmReceiver.kt` — `BroadcastReceiver` target for `AlarmManager`
  `PendingIntent`s; forwards the fire intent to `OverlayAlarmService`
- `OverlayAlarmModule.kt` — React Native bridge (`ReactContextBaseJavaModule`)
  exposing `fireOverlayAlarm`, `dismissOverlayAlarm`, `scheduleOverlayAlarm`,
  `cancelOverlayAlarm` to JS; relays button-action events from a
  `LocalBroadcastReceiver` to JS via `RCTDeviceEventEmitter`
- `OverlayAlarmPackage.kt` — `ReactPackage` wrapper; registered in
  `MainApplication.kt`
- `overlayAlarmBridge.ts` — TypeScript facade (same lazy-require / cached-probe
  pattern as `nativeAppControl.ts`); full fallback to no-op + console.warn when
  the native module is absent; test hooks for driving events without a real module
- `notificationService.ts` updated — `scheduleAlarm()` now schedules via
  AlarmManager in addition to expo-notifications (expo-notifications remains the
  guaranteed fallback); two new exports: `fireOverlayAlarmNow` and
  `setupOverlayAlarmResponseHandler`
- `App.tsx` updated — permission gate card shown on first launch when
  `SYSTEM_ALERT_WINDOW` is not yet granted; falls back silently if denied
- `AndroidManifest.xml` updated — `OverlayAlarmService` and `AlarmReceiver`
  declared; `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, and
  `POST_NOTIFICATIONS` permission declarations added
- 12 new unit tests for `overlayAlarmBridge.ts` covering all 8 acceptance
  criteria (module present/absent, fallback path, event subscription lifecycle)

**Items carried forward:** None — all planned acceptance criteria were delivered.
A Play Store `FOREGROUND_SERVICE_SPECIAL_USE` declaration form and exact-alarm
permission review are required as manual steps before the first Play Store
submission; these are publish-time tasks, not code changes.
