APPROVED

## Final Sprint Review — Phase 12 Overlay Alarms (post dyp.14 fix)

### Build health
- `git diff main...feat/phase-12-overlay-alarms --stat` — 15 files, +1847/-3.
- `npx tsc --noEmit` — clean (no output, exit 0).
- `npx jest --no-coverage` — 9 suites, 185 tests, all pass. Console output is
  expected diagnostic logging from `notificationService` overlay integration paths.

### Definition of Done — checklist

| # | Requirement | Verdict |
|---|---|---|
| 1 | `OverlayAlarmService.kt` committed | PASS — foreground service, WindowManager overlay (`TYPE_APPLICATION_OVERLAY` + `FLAG_NOT_FOCUSABLE | FLAG_LAYOUT_IN_SCREEN | FLAG_KEEP_SCREEN_ON`), three buttons (Done/Postpone/Re-roll), API 34+ `FOREGROUND_SERVICE_TYPE_SPECIAL_USE` handling, notification channel `overlay_alarm_service`, `START_NOT_STICKY`. |
| 2 | `OverlayAlarmModule.kt` committed | PASS — `fireOverlayAlarm`, `dismissOverlayAlarm`, `scheduleOverlayAlarm`, `cancelOverlayAlarm` all present as `@ReactMethod`. `canDrawOverlays` gate rejects with `ERR_OVERLAY_NOT_GRANTED`. LocalBroadcast receiver bridges service → JS event `overlayAlarmAction`. `addListener`/`removeListeners` stubs present for `NativeEventEmitter`. |
| 3 | `OverlayAlarmPackage.kt` committed | PASS — standard `ReactPackage` returning `OverlayAlarmModule`. |
| 4 | `AlarmReceiver.kt` committed | PASS — `BroadcastReceiver` forwards `AlarmManager` trigger to `OverlayAlarmService` with `ACTION_FIRE_OVERLAY` + task extras. Manifest declares it `exported="false"`. |
| 5 | `overlayAlarmBridge.ts` with fallback path committed | PASS — lazy `NativeModules.OverlayAlarm` lookup, cached, `warnUnavailable` fires once. Returns discriminated `{fired|scheduled: 'overlay'|'unavailable'|'permission_denied'}`. Test hooks (`__setOverlayAlarmAvailable`, `__resetOverlayAlarmCache`, `__emitOverlayAlarmAction`, `__setMockOverlayAlarmScheduled`) enable full JS-side coverage without a real native module. |
| 6 | `notificationService.ts` routes `scheduleAlarm` through bridge when available | PASS (via dyp.14) — after `expo-notifications` schedule, when `taskId != null` it calls `overlayAlarmBridge.scheduleOverlayAlarm(String(taskId), title, eventDate.getTime())`. Wrapped in `try/catch` so bridge failure is non-fatal — expo-notifications alarm still fires as fallback. Also exposes `fireOverlayAlarmNow` and `setupOverlayAlarmResponseHandler` for the JS action-handler loop. |
| 7 | `App.tsx` shows permission prompt card on first launch | PASS — permission gate card renders when `appControl.isAvailable && appControl.permissions?.overlay === false && !hasDismissedOverlayGate`. "Enable" calls `appControl.requestOverlay`, "Not now" persists `overlay_gate_dismissed=true` in settings. Auto-clears the dismissed flag on false → true permission transition so it re-arms if the user later revokes. Overlay action handler wired via `setupOverlayAlarmResponseHandler` with the same Done/Postpone/Re-roll semantics as tray notifications. |
| 8 | `AndroidManifest.xml` declares service + AlarmReceiver + all permissions | PASS — `SYSTEM_ALERT_WINDOW`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, `POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM` (maxSdkVersion=32), `USE_EXACT_ALARM` (API 33+) all declared. Service declared with `foregroundServiceType="specialUse"` + `PROPERTY_SPECIAL_USE_FGS_SUBTYPE=alarms_and_reminders`. Receiver declared `exported="false"`. |
| 9 | `MainApplication.kt` registers `OverlayAlarmPackage` | PASS — `add(OverlayAlarmPackage())` alongside `AppControlPackage()` in `getPackages()`. |
| 10 | `npx tsc --noEmit` passes | PASS — no output, exit 0. |
| 11 | All existing tests pass + new bridge/AlarmManager tests pass | PASS — 9/9 suites, 185/185 tests. New coverage in `overlayAlarmBridge.test.ts` (bridge availability, fire/schedule/cancel/dismiss, permission_denied propagation, listener add/remove, event emitter fallback) and `notificationService.test.ts` (overlay-bridge integration: both-called, no-bridge-without-taskId, resolves on permission_denied / unavailable / unexpected rejection, `fireOverlayAlarmNow`, `setupOverlayAlarmResponseHandler` routing). |

### Sprint-level assessment

The sprint delivered on the original goal stated in `requirements.md`: replace the
expo-notifications MAX-importance alarm tier with a native Android foreground
service that fires a floating overlay window at trigger time.

- **Design conformance**: matches `design.md` — foreground service +
  `TYPE_APPLICATION_OVERLAY`, native LinearLayout (no RN component on the
  critical path), fallback chain to expo-notifications when the bridge is
  absent or permission denied.
- **Graceful degradation**: three layers — (a) `canDrawOverlays` check inside
  the module rejects with `ERR_OVERLAY_NOT_GRANTED`; (b) `overlayAlarmBridge`
  returns discriminated results without throwing on absent module or
  permission denial; (c) `notificationService.scheduleAlarm` wraps the bridge
  call in `try/catch` so the tray notification still fires. Confirmed by the
  5-case integration test block.
- **AlarmManager wiring** (dyp.14): the previously identified blocker — that
  `scheduleAlarm` never invoked the bridge in production — is fixed and has
  been reviewed and approved in isolation. End-to-end path: JS
  `scheduleAlarm` → `overlayAlarmBridge.scheduleOverlayAlarm` →
  `OverlayAlarmModule.scheduleOverlayAlarm` →
  `AlarmManager.setExactAndAllowWhileIdle` → `AlarmReceiver.onReceive` →
  `OverlayAlarmService.startService(ACTION_FIRE_OVERLAY)` → overlay drawn.
- **No new npm dependencies** — all Kotlin, all Android SDK, zero JS deps
  added. Complies with the CLAUDE.md rule.
- **Permission UX**: covered by the App.tsx card with the auto-rearm on
  revoke. Deep-links via the existing `nativeAppControl.requestOverlayPermission`
  from Phase 11.1 — no duplicate plumbing.

### Releasable-state assessment

**Yes, this branch is in a releasable state**, with the caveats below (all
expected and documented in `design.md`, none blocking a merge):

1. Play Store publish requires a one-time `FOREGROUND_SERVICE_SPECIAL_USE`
   declaration form ("alarms and reminders" use case) — this is a Console
   step, not a code change, and is called out in `design.md`.
2. `PROPERTY_SPECIAL_USE_FGS_SUBTYPE=alarms_and_reminders` is set in the
   manifest so the store declaration aligns with the code.
3. Kotlin unit tests are intentionally out of scope (`design.md`: "the Kotlin
   layer is thin wiring"). The JS side has strong coverage of the contract.
4. OEM overlay blocking (MIUI, ColorOS) is handled by the fallback chain — an
   overlay-denied device still gets the standard MAX-importance
   `expo-notifications` alarm.

### Remaining gaps / follow-ups (non-blocking)

- None that block release. Possible future work (out of Phase 12 scope):
  full-screen alarm activity for the "wake-from-sleep" case (weighed and
  rejected in `design.md`); Kotlin instrumentation tests once the app has a
  CI Android emulator; OEM-specific setup deep-links.

### Verdict

All 11 Definition-of-Done items pass. TypeScript is clean. All 185 tests are
green. The production wiring gap that failed the earlier final review has
been resolved by dyp.14 and independently approved. The sprint fulfils the
stated goal and the branch is ready to merge to `main`.

reopenIds: []
newTasks: []
