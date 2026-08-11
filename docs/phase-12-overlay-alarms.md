# Phase 12 — Overlay Alarm Architecture

## What was built

Phase 12 adds a native Android overlay alarm system to RandomTime. When a task
alarm becomes due, a floating card appears over whatever the user is looking at
on their phone — no need to open the app. Three buttons (Done, Postpone,
Re-roll) let the user respond inline. The overlay is delivered by a native
Android foreground service, bypassing the expo-notifications stack for this
tier while preserving it as a fallback.

## Architecture decision: Foreground Service + WindowManager overlay

Two approaches were considered:

| Approach | Pros | Cons |
|---|---|---|
| Full-screen alarm Activity | Best UX, wakes device, appears over lock screen | Requires `USE_FULL_SCREEN_INTENT` (Play Store scrutiny); harder to dismiss gracefully |
| Foreground service + `TYPE_APPLICATION_OVERLAY` | Permission already declared (Phase 11.1); appears over current app; easy to dismiss; no lock-screen wake needed | Does not wake device from sleep |

The foreground service + overlay approach was chosen. The `SYSTEM_ALERT_WINDOW`
permission was already declared and the JS bridge to request it already existed
from Phase 11.1. The ADHD nudging use case benefits more from "appears when
you're actively using the phone" than "wakes you from sleep" — the primary
scenario is an alarm firing while the user is already engaged with another app.

## End-to-end chain

```
scheduleAlarm(title, eventDate, taskId)           [notificationService.ts]
  │
  ├─ scheduleNotificationAsync(...)               [expo-notifications, always runs]
  │
  └─ overlayAlarmBridge.scheduleOverlayAlarm(taskId, title, triggerAtMs)
       │
       └─ OverlayAlarmModule.scheduleOverlayAlarm()  [Kotlin @ReactMethod]
            │
            └─ AlarmManager.setExactAndAllowWhileIdle(RTC_WAKEUP, triggerMs, pendingIntent)
                 │
                 └─ [at trigger time] → AlarmReceiver.onReceive()
                      │
                      └─ startService(ACTION_FIRE_OVERLAY → OverlayAlarmService)
                           │
                           ├─ startForeground(NOTIFICATION_ID, notification)
                           └─ WindowManager.addView(overlayCard, params)
                                │
                                └─ [user taps button]
                                     │
                                     ├─ LocalBroadcastManager.sendBroadcast(ALARM_ACTION_BROADCAST)
                                     │    └─ OverlayAlarmModule.alarmActionReceiver.onReceive()
                                     │         └─ RCTDeviceEventEmitter.emit("overlayAlarmAction", payload)
                                     │              └─ overlayAlarmBridge.onAlarmAction(listener)
                                     │                   └─ setupOverlayAlarmResponseHandler handlers
                                     └─ stopSelf() + removeView()
```

## Component map

```
JS layer                              Kotlin layer
────────────────────────────────────  ────────────────────────────────────────────────
overlayAlarmBridge.ts                 OverlayAlarmModule.kt
  fireOverlayAlarm()      ─────────>    @ReactMethod fireOverlayAlarm()
  dismissOverlayAlarm()   ─────────>    @ReactMethod dismissOverlayAlarm()
  scheduleOverlayAlarm()  ─────────>    @ReactMethod scheduleOverlayAlarm()
  cancelOverlayAlarm()    ─────────>    @ReactMethod cancelOverlayAlarm()
  onAlarmAction(listener) <─────────    emit("overlayAlarmAction", payload)

notificationService.ts                OverlayAlarmService.kt (foreground service)
  scheduleAlarm()         ─────────>    ACTION_FIRE_OVERLAY intent
                                          WindowManager.addView(overlayCard)
                                          button taps → LocalBroadcast → emit
                          <─────────    stopSelf() on button tap / dismiss

App.tsx                               AndroidManifest.xml
  permission prompt card  ─────────>    SYSTEM_ALERT_WINDOW (Phase 11.1)
  useEffect on mount                    OverlayAlarmService declared
  requestOverlayPermission()            FOREGROUND_SERVICE permission
                                        FOREGROUND_SERVICE_SPECIAL_USE permission

                                      AlarmReceiver.kt
                                        BroadcastReceiver (AlarmManager target)
                                        forwards intent to OverlayAlarmService
```

## Fallback chain

```
scheduleAlarm() in notificationService.ts
  │
  ├─ expo-notifications.scheduleNotificationAsync()  ← always fires (baseline fallback)
  │
  └─ overlayAlarmBridge.scheduleOverlayAlarm()
       │
       ├─ native module absent (Expo Go / CI / web)
       │    └─ no-op + console.warn (one-time); expo-notifications alarm already set
       │
       └─ native module present
            ├─ SYSTEM_ALERT_WINDOW granted
            │    └─ AlarmManager schedules overlay; fires at trigger time
            │
            └─ SYSTEM_ALERT_WINDOW not granted
                 └─ rejects with ERR_OVERLAY_NOT_GRANTED
                      └─ bridge returns { scheduled: 'permission_denied' }
                           └─ notificationService catches + logs; expo-notifications alarm fires
```

The fallback is designed so that expo-notifications is always scheduled first.
The overlay is an additive layer — if anything in the native path fails, the
user still gets the standard alarm notification.

## Overlay window specification

- Window type: `TYPE_APPLICATION_OVERLAY` (API 26+); falls back to deprecated
  `TYPE_PHONE` on older APIs
- Window flags: `FLAG_NOT_FOCUSABLE | FLAG_LAYOUT_IN_SCREEN | FLAG_KEEP_SCREEN_ON`
- Gravity: `BOTTOM | CENTER_HORIZONTAL` with a 48 dp bottom margin
- Width: `MATCH_PARENT` with 32 dp side padding applied via the card's own padding
- Height: `WRAP_CONTENT`
- The overlay layout is a native Android `LinearLayout` built in Kotlin — it is
  not a React Native component. This avoids RN bridge overhead on the critical
  alarm path and keeps the service fully self-contained; it can display even
  when the JS thread is busy or the React host is in the background

## AlarmManager API notes

`scheduleOverlayAlarm` in `OverlayAlarmModule` uses `AlarmManager` for exact
wake timing:

- API 23-30: `setExactAndAllowWhileIdle(RTC_WAKEUP, ...)` unconditionally
- API 31+ (Android 12+): checks `canScheduleExactAlarms()` first
  - If granted: `setExactAndAllowWhileIdle`
  - If not granted: falls back to `setExact` (less guaranteed while idle)
- `RTC_WAKEUP` type is used so the alarm fires even if the device is in deep
  sleep (Doze mode)
- Each task gets a unique `PendingIntent` keyed by `taskId.hashCode()` so alarms
  can be independently cancelled via `cancelOverlayAlarm`
- `PendingIntent` flags include `FLAG_IMMUTABLE` on API 23+ as required by
  Android 12 policy

## Binding decisions

**No Kotlin unit tests.** The Kotlin layer is pure wiring: receive an intent,
start a service, add a view, send a broadcast. The meaningful contract (module
available vs. unavailable, fallback behaviour, event delivery) is tested entirely
in JS via `overlayAlarmBridge.test.ts` with mocked `NativeModules`. Kotlin is
exercised manually on a device or emulator.

**`foregroundServiceType="specialUse"` on API 34+.** Android 14 requires the
`foregroundServiceType` attribute to be declared in the manifest; without it the
service crashes on start. The type `specialUse` is the correct catch-all for an
overlay-alarm use case. This requires a one-time Play Store declaration form at
publish time stating the alarm/reminder purpose — a manual step, not a code
change.

**No new npm dependencies.** The entire native side is pure Android SDK and
Kotlin. Zero additional JS packages were added.

**`START_NOT_STICKY` for `OverlayAlarmService`.** The service is one-shot — once
the user taps a button or the overlay is dismissed, the service stops. If the OS
kills it before the user responds, the expo-notifications alarm (already
scheduled) covers the user.

**LocalBroadcast for intra-process action events.** Button taps in
`OverlayAlarmService` are communicated back to `OverlayAlarmModule` via
`LocalBroadcastManager` (not a global broadcast). `OverlayAlarmModule` holds a
`BroadcastReceiver` registered in `initialize()` and unregistered in
`invalidate()` and `onHostDestroy()`. This keeps the event bus private to the
app and avoids security issues with global broadcasts.

**`NativeEventEmitter` stubs in `OverlayAlarmModule`.** React Native 0.65+
warns if a module used with `NativeEventEmitter` does not expose `addListener`
and `removeListeners` methods. Both are present as no-ops because the actual
event path is driven by the `LocalBroadcastReceiver` — the `NativeEventEmitter`
stubs exist solely to silence the framework warning.

**Lazy `require()` in `overlayAlarmBridge.ts`.** `NativeModules` and
`NativeEventEmitter` are accessed via dynamic `require()` inside helper functions
rather than top-level imports. This prevents Jest and managed Expo builds from
triggering React Native's native binding side effects at module load time.
The availability result is cached after the first probe.

## JS public API (`overlayAlarmBridge.ts`)

Default export object:

| Method | Returns | Notes |
|---|---|---|
| `fireOverlayAlarm(taskId, taskTitle)` | `Promise<{fired}>` | `fired`: `'overlay'` / `'unavailable'` / `'permission_denied'` |
| `dismissOverlayAlarm(taskId)` | `Promise<void>` | No-op when module absent |
| `scheduleOverlayAlarm(taskId, taskTitle, triggerAtMs)` | `Promise<{scheduled}>` | `scheduled`: same values as `fired` above |
| `cancelOverlayAlarm(taskId)` | `Promise<void>` | No-op when module absent |
| `onAlarmAction(listener)` | `() => void` (unsubscribe) | Uses `NativeEventEmitter` when available; internal `Set` when absent (test path) |

Named exports: `isOverlayAlarmAvailable()`, `OverlayAlarmAction` type, test
hooks `__setOverlayAlarmAvailable`, `__resetOverlayAlarmCache`,
`__emitOverlayAlarmAction`, `__setMockOverlayAlarmScheduled`.

## `notificationService.ts` integration

`scheduleAlarm()` now runs two paths in sequence:

1. `expo-notifications` — always scheduled, serves as the guaranteed fallback
2. `overlayAlarmBridge.scheduleOverlayAlarm()` — scheduled when `taskId` is
   provided; errors are caught and logged, never thrown, so the expo-notifications
   alarm is unaffected

Two new exports handle the overlay response path:
- `fireOverlayAlarmNow(taskId, title)` — immediately fires the overlay (no
  AlarmManager scheduling; used when the alarm is already due)
- `setupOverlayAlarmResponseHandler(handlers)` — subscribes to
  `overlayAlarmBridge.onAlarmAction()` and routes events to the same
  `onDone / onPostpone / onReroll` handler objects used by the
  notification response handler

## Play Store requirements

Before publishing to the Play Store, two manual steps are required:

1. **`FOREGROUND_SERVICE_SPECIAL_USE` declaration form** — Google requires apps
   using this foreground service type to complete a use-case disclosure explaining
   why `specialUse` is necessary. The legitimate reason is "overlay alarm for task
   reminders" — no unusual permissions are involved.
2. **`SCHEDULE_EXACT_ALARM` or `USE_EXACT_ALARM`** — if the app targets API 31+
   and relies on `setExactAndAllowWhileIdle`, the Play Store listing must describe
   the alarm use case. `USE_EXACT_ALARM` (API 33+) is pre-granted for alarm apps
   and may be preferable to `SCHEDULE_EXACT_ALARM` which requires user approval;
   evaluate at publish time based on the target SDK version chosen.

OEM notes: `TYPE_APPLICATION_OVERLAY` is blocked by Android's
battery-optimisation screens on some OEM skins (Xiaomi MIUI, OPPO ColorOS). The
fallback to expo-notifications handles these devices transparently.
