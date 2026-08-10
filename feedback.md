APPROVED

## Notes — iter-2

### random-time-dyp.2 — OverlayAlarmService.kt

All acceptance criteria met.

- Extends `android.app.Service`; `onStartCommand` dispatches on `ACTION_FIRE_OVERLAY` and `ACTION_DISMISS_OVERLAY`.
- `ACTION_FIRE_OVERLAY` path: calls `startForegroundCompat()` before `showOverlay()` (correct Android 8+ ordering), posts notification in `overlay_alarm_service` channel with `IMPORTANCE_LOW` and `setOngoing(true)`.
- API 34+ branch passes `FOREGROUND_SERVICE_TYPE_SPECIAL_USE` to the 3-arg `startForeground` overload; pre-34 uses the 2-arg variant.
- Overlay params: `TYPE_APPLICATION_OVERLAY` (with pre-O `TYPE_PHONE` fallback), `FLAG_NOT_FOCUSABLE | FLAG_LAYOUT_IN_SCREEN | FLAG_KEEP_SCREEN_ON`, gravity `BOTTOM | CENTER_HORIZONTAL`, 48 dp bottom margin, `MATCH_PARENT` width.
- Card built programmatically: `LinearLayout(VERTICAL)` → `TextView` (18 sp, bold) + `LinearLayout(HORIZONTAL)` with three equal-weight `Button`s (Done / Postpone / Re-roll).
- Button tap: `sendAlarmBroadcast(taskId, actionKey)` → `LocalBroadcastManager` broadcast with action `com.anonymous.randomtime.OVERLAY_ALARM_ACTION` and extras {taskId, action}, then `removeOverlay()` + `stopSelf()`.
- `ACTION_DISMISS_OVERLAY`: `removeOverlay()` + `stopSelf()` — silent.
- Returns `START_NOT_STICKY` (matches task AC; requirements.md erroneously says START_STICKY — task AC is authoritative).
- `onDestroy` calls `removeOverlay()` — view cleaned up if still attached.
- `NOTIFICATION_CHANNEL_ID` constant is `"overlay_alarm_service"` — matches AC exactly.
- Two unused imports (`BroadcastReceiver`, `IntentFilter`) are dead code; no behavioral impact. Worth cleaning up in a follow-on pass.
- `npx tsc --noEmit` passes.

### random-time-dyp.6 — overlayAlarmBridge.ts unit tests

All 8 acceptance criteria covered; 12 test cases written; all pass.

1. `isOverlayAlarmAvailable` defaults to false (NativeModules.OverlayAlarm absent) — present.
2. `__setOverlayAlarmAvailable(true|false|null)` overrides correctly — three sub-cases present.
3. `fireOverlayAlarm` returns `{fired:'unavailable'}` when module absent + `console.warn` fires exactly once across multiple calls — tested via `jest.isolateModules` for a clean `_warnedUnavailable` state.
4. `fireOverlayAlarm` returns `{fired:'permission_denied'}` on `ERR_OVERLAY_NOT_GRANTED` rejection — mock native module injected via `getMockNativeModules()` + `__resetOverlayAlarmCache()`.
5. `fireOverlayAlarm` returns `{fired:'overlay'}` when native resolves — present.
6. `dismissOverlayAlarm` no-ops (does not throw) when module absent — `resolves.toBeUndefined()` assertion.
7. `onAlarmAction` listener receives payloads from `__emitOverlayAlarmAction` — present.
8. Unsubscribe removes listener — present.
- Additional multi-listener fan-out test also present.
- `npx jest --testPathPattern="overlayAlarm|notificationService"` → 41 tests, all pass.

### random-time-dyp.7 — notificationService.ts overlay wiring

All acceptance criteria met.

- `scheduleAlarm` is unchanged: still schedules via expo-notifications, still stores `taskId` in `data` payload (line 145), still returns the notification id.
- `fireOverlayAlarmNow(taskId: string, title: string): Promise<void>` exported: calls `overlayAlarmBridge.fireOverlayAlarm`; on `{fired:'unavailable'|'permission_denied'}` the function completes without throwing (no-op per spec) since the result is only logged — expo-notification fallback is intact.
- `setupOverlayAlarmResponseHandler(handlers: OverlayAlarmResponseHandlers): () => void` exported: subscribes to `overlayAlarmBridge.onAlarmAction`, routes done/postpone/reroll to the three handler callbacks, returns the cleanup function from the bridge.
- Existing `notificationService.test.ts` tests pass unchanged.
- No behavioral change in Jest (bridge absent → no-op).
- `OverlayAlarmResponseHandlers` interface exported (done/postpone/reroll shape matches the handler contract).

Minor observations (not blocking):
- The notification body in `scheduleAlarm` is unchanged (`"${title}" — your random time has arrived.`); the AC mentions shortening it "since the overlay carries the primary UX." This is cosmetic and left for the App.tsx / UX polish pass.
- `fireOverlayAlarmNow` accepts `taskId: string` while `scheduleAlarm` takes `taskId?: number`. This type-shape split is consistent with the bridge's own string-based `OverlayAlarmAction.taskId` and is a pre-existing architectural choice, not introduced here.

reopenIds: []
newTasks: []
