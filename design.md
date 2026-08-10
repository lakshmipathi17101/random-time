# Phase 12 Design — Overlay Alarm Architecture

## Chosen approach: Foreground Service + WindowManager overlay

Two routes were considered:

| Route | Pros | Cons |
|---|---|---|
| Full-screen alarm Activity | Best UX — wakes device, appears over lock screen | Requires `USE_FULL_SCREEN_INTENT` (Play Store scrutiny); harder to dismiss gracefully |
| Foreground service + TYPE_APPLICATION_OVERLAY | Already permitted (Phase 11.1); no lock-screen, appears over current app; easy dismiss | Does not wake device from sleep |

**Decision: Foreground service + overlay.** The permission is already declared and the
bridge to request it already exists. The use case (ADHD task nudging) benefits more from
"appears when you're using your phone" than "wakes you from sleep" — alarms that fire while
you're already active are the primary case.

## Component map

```
JS layer                         Kotlin layer
─────────────────────────────    ─────────────────────────────────────────
overlayAlarmBridge.ts            OverlayAlarmModule.kt
  fireOverlayAlarm()     ──────>   @ReactMethod fireOverlayAlarm()
  dismissOverlayAlarm()  ──────>   @ReactMethod dismissOverlayAlarm()
  onAlarmAction()        <──────   sendEvent("overlayAlarmAction", payload)

notificationService.ts           OverlayAlarmService.kt (foreground service)
  scheduleAlarm()        ──────>   startService(ACTION_FIRE_OVERLAY)
                                     WindowManager.addView(overlayLayout)
                                     button taps → broadcast → sendEvent
                         <──────   stopSelf() on button tap

App.tsx                          AndroidManifest.xml
  permission prompt card ──────>   SYSTEM_ALERT_WINDOW declared (Phase 11.1)
  useEffect on mount               OverlayAlarmService declared
  nativeAppControl                 FOREGROUND_SERVICE permission
  .requestOverlayPermission()      FOREGROUND_SERVICE_SPECIAL_USE permission
```

## Fallback chain

```
fireOverlayAlarm()
  ├─ canDrawOverlays? yes ──> OverlayAlarmService fires overlay
  └─ no ──────────────────> scheduleAlarm() notification fallback (existing path)

overlayAlarmBridge.ts not available (Expo Go / tests)
  └─ no-op + console.warn; notificationService falls back to expo-notifications
```

## Overlay window spec

- `TYPE_APPLICATION_OVERLAY`
- `FLAG_NOT_FOCUSABLE | FLAG_LAYOUT_IN_SCREEN | FLAG_KEEP_SCREEN_ON`
- Gravity: `Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL`, margin 48 dp from bottom
- Width: `MATCH_PARENT - 32dp padding`; height: `WRAP_CONTENT`
- Dark card background, task title in bold, three buttons in a row

## Event flow (happy path)

1. JS calls `scheduleAlarm(title, eventDate, taskId)` at alarm time.
2. `notificationService` calls `overlayAlarmBridge.fireOverlayAlarm(taskId, title)`.
3. Bridge calls `OverlayAlarmModule.fireOverlayAlarm(taskId, title)`.
4. Module starts `OverlayAlarmService` with intent extras.
5. Service draws overlay, posts foreground notification.
6. User taps "Re-roll".
7. Service broadcasts action, sends `overlayAlarmAction` event to JS with
   `{ taskId, action: 'reroll' }`, calls `stopSelf()`.
8. `notificationService` response handler (already handles `reroll`) reschedules.

## Binding decisions

- **No Kotlin unit tests** — the Kotlin layer is pure wiring (start service, add view,
  send event); tested manually via device/emulator. JS bridge tests cover the JS contract.
- **`foregroundServiceType="specialUse"`** on API 34+ requires a Play Store form; that is
  an acceptable one-time manual step at publish time, not a code change.
- **The overlay is not a React Native component** — it is a native Android `LinearLayout`
  inflated from a Kotlin-side layout resource. This avoids React Native bridge overhead on
  the critical alarm path and keeps the service self-contained.
- **No new npm dependencies** — all Kotlin, all Android SDK, zero JS deps added.
