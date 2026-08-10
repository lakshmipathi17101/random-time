APPROVED

## Notes — iter-3

### random-time-dyp.3 — OverlayAlarmModule.kt + OverlayAlarmPackage.kt

All acceptance criteria met.

- `OverlayAlarmModule.kt` placed in `overlayalarm/` package; `getName()` returns `"OverlayAlarm"` via `MODULE_NAME` constant.
- `@ReactMethod fireOverlayAlarm(taskId, taskTitle, promise)`: checks `Settings.canDrawOverlays`; rejects with `ERR_OVERLAY_NOT_GRANTED` when false; starts `OverlayAlarmService` via intent with `ACTION_FIRE_OVERLAY` + extras and resolves null when true.
- `@ReactMethod dismissOverlayAlarm(taskId, promise)`: sends `ACTION_DISMISS_OVERLAY` intent; resolves null.
- `BroadcastReceiver` registered in `initialize()` via `LocalBroadcastManager`, listening for `ALARM_ACTION_BROADCAST`; unregistered in both `invalidate()` and `onHostDestroy()` — correct dual-unregister pattern.
- On receive: emits `overlayAlarmAction` event via `DeviceEventManagerModule.RCTDeviceEventEmitter` with `WritableMap{taskId, action}`.
- `addListener`/`removeListeners` are `@ReactMethod` no-op stubs — satisfies RN 0.65+ `NativeEventEmitter` requirement.
- `OverlayAlarmPackage.kt` mirrors `AppControlPackage`: implements `ReactPackage`, `createNativeModules` returns `listOf(OverlayAlarmModule(reactContext))`, `createViewManagers` returns `emptyList()`.

### random-time-dyp.4 — Register OverlayAlarmPackage in MainApplication.kt

All acceptance criteria met.

- `import com.anonymous.randomtime.overlayalarm.OverlayAlarmPackage` added at top of file.
- `add(OverlayAlarmPackage())` added inside `getPackages()` directly after `add(AppControlPackage())`.
- No other changes to the file.

### random-time-dyp.8 — notificationService.test.ts: new fireOverlayAlarmNow + setupOverlayAlarmResponseHandler

All acceptance criteria met.

- `overlayAlarmBridge` mocked before import via `jest.mock()` factory; mock `fireOverlayAlarm`, `dismissOverlayAlarm`, and `onAlarmAction` all in place.
- `__emitOverlayAlarmAction` test helper correctly shares `mockOverlayListeners` array with the factory.
- `fireOverlayAlarmNow` tests (3 cases): verifies `overlayAlarmBridge.fireOverlayAlarm` called with correct taskId + title; `{fired:'unavailable'}` path is a no-op (resolves undefined, does not throw); `{fired:'permission_denied'}` path likewise no-op.
- `setupOverlayAlarmResponseHandler` tests (4 cases): routes `done`, `postpone`, and `reroll` payloads to the corresponding handlers with the correct taskId; cleanup function stops event delivery — asserted by calling `cleanup()`, then emitting, and confirming no handler was called.
- All 180 tests pass; no changes to jest config.

### random-time-dyp.9 — App.tsx: overlay permission gate card + wire overlay response handler

All acceptance criteria met.

- `setupOverlayAlarmResponseHandler` imported from `notificationService` (the AC lists it alongside `overlayAlarmBridge`; App.tsx does not need the bridge directly since all interaction flows through the service helper — the same combined-cleanup pattern the AC describes is implemented and correct).
- Existing `setupNotificationResponseHandler` useEffect extended: `cleanupNotif` + `cleanupOverlay` returned together as a combined cleanup function.
- `hasDismissedOverlayGate` state + `prevOverlayGrantedRef` ref declared; `overlay_gate_dismissed` setting hydrated from `getSetting` on mount.
- `overlayPermissionCard` renders only when `appControl.isAvailable && appControl.permissions?.overlay === false && !hasDismissedOverlayGate` — all three conditions guarded correctly.
- Card text matches AC: title `"Enable Full-Screen Alarms"`, body explains overlay permission and names the three buttons.
- "Enable" button calls `appControl.requestOverlay()`.
- "Not now" button calls `setHasDismissedOverlayGate(true)` + `upsertSetting('overlay_gate_dismissed', 'true')`.
- `useEffect` on `appControl.permissions?.overlay` detects false→true transition; clears `hasDismissedOverlayGate` and persists `overlay_gate_dismissed = 'false'`.
- All 7 required style keys present: `overlayPermissionCard`, `overlayPermissionTitle`, `overlayPermissionBody`, `overlayPermissionRow`, `overlayPermissionBtnPrimary`, `overlayPermissionBtnSecondary`, `overlayPermissionBtnText`; all use `t.surface`, `t.accent`, `t.text`/`t.textMuted` from the theme — pattern consistent with adjacent cards.
- `appControl.isAvailable === false` → card hidden, no crash.
- `npx tsc --noEmit` passes; `npx jest --no-coverage` → 180 tests, all pass.

reopenIds: []
newTasks: []
