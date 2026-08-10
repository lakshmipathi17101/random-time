APPROVED

## Notes

### Coverage
All seven deliverables in requirements.md § "What must be built" are covered by the ten tasks:
- OverlayAlarmService.kt → dyp.2
- OverlayAlarmModule.kt + OverlayAlarmPackage.kt → dyp.3
- Register in MainApplication.kt + AndroidManifest.xml → dyp.1 + dyp.4
- overlayAlarmBridge.ts → dyp.5
- Wire notificationService.ts → dyp.7
- App.tsx permission gate → dyp.9
- JS tests (bridge + notificationService) → dyp.6 + dyp.8

Definition-of-done checklist fully mapped. No requirement is orphaned.

### Task Size
All tasks are appropriately scoped. No task is too broad to implement in a single sitting:
- dyp.1 (manifest): single XML file, narrow additions — S
- dyp.2 (Service): one new Kotlin file, non-trivial Android APIs (WindowManager, foreground
  service, broadcast) but pure Android, no RN bridge — L
- dyp.3 (Module + Package): two new Kotlin files, BroadcastReceiver + NativeEventEmitter
  bridge wiring, moderate complexity — M
- dyp.4 (MainApplication): one-line edit to one file — S
- dyp.5 (bridge TS): one new TS file, event emitter + fallback chain + test hooks, moderate
  complexity but well-templated from nativeAppControl.ts — M
- dyp.6 (bridge tests): one new test file, eight test cases — M
- dyp.7 (notificationService wire): one existing TS file, adds two exported functions — M
- dyp.8 (notificationService tests): extends existing test file, four new cases — M
- dyp.9 (App.tsx gate): one existing file, new card + useEffect + state hydration — M
- dyp.10 (verify): no file changes, checkpoint — S

### Acceptance Criteria Quality
Criteria are specific and verifiable throughout. Highlights:
- dyp.1 names exact permission strings and requires the
  `android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE` property element (API 34 correctness noted).
- dyp.2 specifies intent action names, button labels, return value (START_NOT_STICKY), window
  flags, gravity, and stopSelf() semantics precisely.
- dyp.3 specifies module name string, error code 'ERR_OVERLAY_NOT_GRANTED', event name
  'overlayAlarmAction', addListener/removeListeners stubs for RN 0.65+ compatibility — all
  critical details.
- dyp.5 specifies the exact public API shape, three return variants for fireOverlayAlarm,
  test-hook names, and the console.warn-once guard.
- dyp.6 lists eight numbered cases covering all code paths.
- dyp.9 specifies the dismissed-gate persistence key ('overlay_gate_dismissed'), the auto-
  clear behavior on permission flip, and the exact card copy.

One minor note: dyp.7 AC states "scheduleAlarm keeps returning the notification id" but the
new exported function is fireOverlayAlarmNow (not replacing scheduleAlarm's return). The AC
is correct but could be clearer that scheduleAlarm's signature is unchanged. No fix needed —
the doer note already explains this carefully.

### Dependency Direction
The layer graph is correct:
  dyp.1 → dyp.2 → dyp.3 → dyp.4
  dyp.5 → dyp.6
  dyp.5 → dyp.7 → dyp.8
  dyp.7 → dyp.9
  dyp.4 + dyp.6 + dyp.8 + dyp.9 → dyp.10

dyp.5 (JS bridge) and dyp.1 (manifest) are correctly independent — JS and Kotlin can proceed
in parallel. dyp.10 correctly waits on all leaf tasks.

One observation: the graph shows dyp.2 in LAYER 1 depending on dyp.1, which is correct at
runtime (manifest must be present for service not to crash). At compile time the dependency
is softer, but starting dyp.2 only after dyp.1 is a sound conservative order.

### Model-Tier Assignment
Assignments in the task notes are appropriate:
- cheap-tier: dyp.1 (XML edits only), dyp.4 (single import + one-liner), dyp.10 (no code)
- standard-tier: dyp.2, dyp.3, dyp.5, dyp.6, dyp.7, dyp.8, dyp.9

dyp.2 involves non-trivial Android WindowManager / foreground-service code. standard-tier is
the minimum acceptable; premium would also be defensible. Keeping it standard is fine given
the detailed AC and the code reference to AppControlModule.kt.

dyp.9 (App.tsx) touches App.tsx which is a large, mature file (~1600 lines). standard-tier
is appropriate given the scope is one new card + useEffect extension, not a refactor.

### No Changes Required
All checks pass. No bd commands needed.

## taskAssignments

[{"id":"random-time-dyp.1","bucket":"S","model":"cheap"},{"id":"random-time-dyp.2","bucket":"L","model":"standard"},{"id":"random-time-dyp.3","bucket":"M","model":"standard"},{"id":"random-time-dyp.4","bucket":"S","model":"cheap"},{"id":"random-time-dyp.5","bucket":"M","model":"standard"},{"id":"random-time-dyp.6","bucket":"M","model":"standard"},{"id":"random-time-dyp.7","bucket":"M","model":"standard"},{"id":"random-time-dyp.8","bucket":"M","model":"standard"},{"id":"random-time-dyp.9","bucket":"M","model":"standard"},{"id":"random-time-dyp.10","bucket":"S","model":"cheap"}]
