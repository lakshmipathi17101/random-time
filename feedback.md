APPROVED

## Review — random-time-dyp.14: AlarmManager wiring

### Build health
- `npx tsc --noEmit` — clean (no output).
- `npx jest --no-coverage` — 9 suites, **185 tests**, all pass (up from 180 pre-dyp.14).

### Acceptance criteria checklist

| # | Criterion | Verdict |
|---|---|---|
| 1 | `AlarmReceiver.kt` exists and starts `OverlayAlarmService` correctly | PASS — `AlarmReceiver : BroadcastReceiver` extracts `taskId`/`taskTitle` from intent extras, builds a `OverlayAlarmService` intent with `ACTION_FIRE_OVERLAY`, and calls `context.startService(serviceIntent)`. Registered `exported=false` so only this app's `AlarmManager` `PendingIntent`s can trigger it. |
| 2 | `OverlayAlarmModule` has `scheduleOverlayAlarm` + `cancelOverlayAlarm` `@ReactMethod`s | PASS — both methods present with correct `@ReactMethod` annotation. `scheduleOverlayAlarm` takes `taskId: String, taskTitle: String, triggerAtMs: Double, promise: Promise`. `cancelOverlayAlarm` takes `taskId: String, promise: Promise`. Both delegate to `buildAlarmPendingIntent` for consistent `PendingIntent` construction. |
| 3 | `canScheduleExactAlarms` check present (API 31+ guard) | PASS — inside `scheduleOverlayAlarm`, the code checks `Build.VERSION.SDK_INT >= Build.VERSION_CODES.S` before calling `alarmManager.canScheduleExactAlarms()`. When true it uses `setExactAndAllowWhileIdle`; when false (permission not granted on API 31+) it falls back to `setExact`. Pre-API-23 also handled with plain `setExact`. |
| 4 | `AndroidManifest.xml` declares `AlarmReceiver` + `SCHEDULE_EXACT_ALARM` + `USE_EXACT_ALARM` | PASS — `<receiver android:name=".overlayalarm.AlarmReceiver" android:exported="false"/>` added. `SCHEDULE_EXACT_ALARM` declared with `android:maxSdkVersion="32"` (correct split-permission approach). `USE_EXACT_ALARM` declared for API 33+. Both present. |
| 5 | `overlayAlarmBridge.ts` exposes `scheduleOverlayAlarm` + `cancelOverlayAlarm` with fallback | PASS — both functions implemented with the same lazy-native/fallback pattern as `fireOverlayAlarm`. `scheduleOverlayAlarm` returns `{scheduled: 'overlay' | 'unavailable' | 'permission_denied'}`. `cancelOverlayAlarm` is a no-op with one-time `console.warn` when native is absent. Both included in the default export object. |
| 6 | `notificationService.scheduleAlarm` calls bridge when `taskId` present + bridge available | PASS — after `Notifications.scheduleNotificationAsync` resolves, the code checks `taskId != null` and calls `overlayAlarmBridge.scheduleOverlayAlarm(String(taskId), title, eventDate.getTime())`. Wrapped in `try/catch` so a bridge error is non-fatal and expo-notifications fires as the fallback. |
| 7 | 5 new tests cover the routing and fallback paths | PASS — `overlayAlarmBridge.test.ts` covers bridge `scheduleOverlayAlarm`/`cancelOverlayAlarm` via `__setMockOverlayAlarmScheduled` hook; `notificationService.test.ts` adds the `"scheduleAlarm — overlay bridge integration"` describe block with 5 tests: both-called-with-taskId, no-bridge-call-without-taskId, resolves-on-permission_denied, resolves-on-unavailable, resolves-on-unexpected-rejection. |
| 8 | All 185 tests pass | PASS — confirmed by `npx jest` run above. |

### Additional observations (non-blocking)
- `buildAlarmPendingIntent` uses `taskId.hashCode()` as the `PendingIntent` request code for uniqueness. For very long or specially-crafted task ID strings, `hashCode()` collisions are theoretically possible, but acceptable for this use case given the SQLite-generated IDs in play.
- `PendingIntent.FLAG_IMMUTABLE` correctly applied on API 23+, satisfying the Android 12+ requirement.
- `OverlayAlarmPackage` registered in `MainApplication.kt` alongside `AppControlPackage`.
- `foregroundServiceType="specialUse"` + `PROPERTY_SPECIAL_USE_FGS_SUBTYPE=alarms_and_reminders` correctly paired (Android 14+ requirement).
- No new npm dependencies added.

### Summary
The blocking gap identified in the previous review (overlay never fires in production because `scheduleAlarm` did not call the bridge) is resolved. The AlarmManager path is fully wired: JS schedules via `overlayAlarmBridge.scheduleOverlayAlarm` → native `OverlayAlarmModule.scheduleOverlayAlarm` → `AlarmManager.setExactAndAllowWhileIdle` → `AlarmReceiver` BroadcastReceiver at trigger time → `OverlayAlarmService` draws the overlay. All acceptance criteria met.

newTasks: []
