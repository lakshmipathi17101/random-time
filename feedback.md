CHANGES NEEDED

## Sprint review — phase-12 overlay alarms

### Scope + build health
- 14 files changed, +1536 / -3 (matches expected scope).
- `npx tsc --noEmit` — clean.
- `npx jest --no-coverage` — 9 suites, 180 tests, all pass.
- 12 commits on branch (3 plan/review + 4 feat + 2 test + 1 register + 1 verify + 1 iter-3 review).

### Definition of done checklist

| # | Item | Verdict |
|---|---|---|
| 1 | `OverlayAlarmService.kt`, `OverlayAlarmModule.kt`, `OverlayAlarmPackage.kt` committed | PASS — all three files present under `android/app/src/main/java/com/anonymous/randomtime/overlayalarm/`. |
| 2 | `overlayAlarmBridge.ts` committed with fallback path | PASS — 243 LOC, lazy `getRawNative()`, `warnUnavailable()` guard, fallback listener set for tests, `{fired: 'unavailable' \| 'permission_denied' \| 'overlay'}` return contract. |
| 3 | `notificationService.ts` routes `scheduleAlarm` through the bridge when available | **FAIL — see gap below.** |
| 4 | `App.tsx` shows the permission prompt card on first launch | PASS — card gated on `appControl.isAvailable && permissions?.overlay === false && !hasDismissedOverlayGate`; "Enable" wires `appControl.requestOverlay`; "Not now" persists `overlay_gate_dismissed=true`; false→true grant transition auto-clears the dismissed flag. |
| 5 | `AndroidManifest.xml` declares service + permissions | PASS — `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_SPECIAL_USE`, `POST_NOTIFICATIONS`, plus the `<service>` block with `foregroundServiceType="specialUse"` and the `PROPERTY_SPECIAL_USE_FGS_SUBTYPE=alarms_and_reminders` property. |
| 6 | `MainApplication.kt` registers the package | PASS — `add(OverlayAlarmPackage())` added directly after `add(AppControlPackage())`. |
| 7 | `npx tsc --noEmit` passes | PASS. |
| 8 | Existing tests still pass; new bridge tests pass | PASS — 180/180. |

### Blocking gap — DoD item 3 not satisfied

**The overlay alarm never fires in production.** All the scaffolding is in place — the Kotlin service, the JS bridge, the permission UI, the response handler — but the code path that would actually trigger `fireOverlayAlarm` on the alarm date is missing.

Concretely:
- Requirements §5 says: *"Replace the body of `scheduleAlarm()` with a call to `overlayAlarmBridge.fireOverlayAlarm(taskId, title)` when the native module is available. Keep the existing `expo-notifications` path as the fallback when the bridge is absent."*
- `notificationService.ts::scheduleAlarm` (lines 130-155) still contains only the pre-Phase-12 `Notifications.scheduleNotificationAsync` call. There is no availability check, no bridge branch, no fallback selector.
- A new `fireOverlayAlarmNow(taskId, title)` helper (lines 208-214) was added, but a `grep` across the tree shows it is called only from its own test file — never from `App.tsx` or any production caller.
- Design §Event-flow step 1-2 explicitly reads: *"JS calls `scheduleAlarm(...)` at alarm time. notificationService calls `overlayAlarmBridge.fireOverlayAlarm(...)`."* The current wiring satisfies neither half.

Consequence: on a real Android device with SYSTEM_ALERT_WINDOW granted, tapping "Enable" in the permission card does nothing observable — the alarm still fires as a plain expo-notifications tray notification, exactly as before Phase 12. The three Done/Postpone/Re-roll buttons of the overlay card are shipped as dead code from the user's perspective.

Root cause / design note: expo-notifications schedules on the OS side, so JS is not running at alarm time and cannot invoke `fireOverlayAlarm` from a naive "replace the body" edit. To satisfy the intent of DoD item 3 the branch needs one of:
- (a) An Android `AlarmManager` + `BroadcastReceiver` that launches `OverlayAlarmService` at the scheduled time (Kotlin side), with `scheduleAlarm` calling into it when the bridge is available, or
- (b) A notification-response path where the fired `expo-notifications` alarm triggers the JS `fireOverlayAlarmNow` on tap/foreground and the overlay pops from there (weaker UX but preserves the current scheduling model).

Either resolution is a real work item, not a rename/wire-up fix. Option (a) most faithfully matches the design's "appears when the alarm fires even if the app is backgrounded" promise; option (b) keeps the sprint tight but delivers a materially weaker feature than what the requirements describe.

### Other observations (non-blocking)
- Overlay action taskIds come in as strings; App.tsx `parseInt`s them to match the numeric task IDs from SQLite. Silently drops NaN cases — acceptable defensive handling.
- `App.tsx` extra `parseInt`/`isNaN` branching (lines 495-511) is a small duplication of `setupNotificationResponseHandler`'s onDone/onPostpone/onReroll semantics; could be DRYed but not required.
- Kotlin service uses programmatic `LinearLayout` (no XML layout resource) as design.md §"Binding decisions" specified — correct.
- `foregroundServiceType="specialUse"` correctly paired with the `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` metadata property (Android 14+ requirement).
- No new npm deps added — matches design constraint.
- `SYSTEM_ALERT_WINDOW` permission was already declared in Phase 11.1; no double-declare.

### Verdict
Everything the sprint *built* is well-crafted, thoroughly tested, and matches its stated ACs — but the wired end-to-end trigger is missing, so DoD item 3 is not met and the branch is not in a releasable state. This is a real functional regression against the sprint goal: the user experience is unchanged from pre-Phase-12 despite the whole overlay stack shipping.

reopenIds: []
newTasks:
  - id: random-time-dyp.10
    title: Wire scheduleAlarm through OverlayAlarm bridge (or via native AlarmManager) so the overlay actually fires
    acceptance:
      - When SYSTEM_ALERT_WINDOW is granted and `overlayAlarmBridge.isOverlayAlarmAvailable()` is true, an alarm that reaches its scheduled time results in `OverlayAlarmService` drawing the overlay (verified manually on a device or emulator).
      - When the bridge is unavailable OR the overlay permission is denied, the existing expo-notifications alarm still fires as the fallback (no regression to Phase 10 UX).
      - `scheduleAlarm()` (or a sibling scheduler) invokes `fireOverlayAlarm` at the correct trigger time — not immediately at schedule time. Preferred implementation: extend `OverlayAlarmService`/`OverlayAlarmModule` with an `AlarmManager.setExactAndAllowWhileIdle` + `PendingIntent` path so trigger works when the app is backgrounded/killed.
      - Add `SCHEDULE_EXACT_ALARM` (Android 12+) permission and the runtime `canScheduleExactAlarms` check if the AlarmManager path is chosen.
      - Add a JS integration test (or extend `notificationService.test.ts`) that proves `scheduleAlarm` routes through the bridge when available and falls back to `Notifications.scheduleNotificationAsync` when not.
      - `npx tsc --noEmit` clean; all existing tests still pass; new tests pass.
