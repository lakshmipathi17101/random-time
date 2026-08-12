# Requirements — Pre-Release Quality Sprint

## Goal
Find and fix all bugs in the RandomTime codebase that would cause crashes, data loss,
or broken features on a real Android device. The user installs via sideloaded release
APK (no Metro, no dev server). Every bug fixed here is one fewer install iteration.

## Scope: main branch as of dcc5d6c

Source files in scope (TypeScript only — Kotlin native is out of scope for this sprint):
- App.tsx (main entry, state machine, permission handling, tab navigation)
- db.ts (SQLite: tasks, settings, task_completions tables)
- notificationService.ts (expo-notifications + overlay alarm scheduling)
- overlayAlarmBridge.ts (React Native bridge facade to native overlay)
- utils/weightedRandom.ts, utils/duration.ts, utils/streak.ts, utils/scheduler.ts
- hooks/useAppControl.ts + nativeAppControl.ts
- All components referenced from App.tsx

## Bug categories to hunt (priority order)

### P0 — Crash on launch or first interaction
- Unhandled promise rejections in useEffect on mount (SQLite init, permission check)
- Missing null/undefined guards on data loaded from SQLite before first row exists
- Type mismatches that would crash at runtime (TypeScript is often too permissive with `any`)
- Missing try/catch around expo-calendar, expo-notifications, expo-sqlite calls

### P1 — Silent data loss or broken feature
- SQLite upsert/insert not awaited correctly → stale UI
- Notification cancel not awaiting correctly → ghost notifications fire after task delete
- AlarmManager scheduling race (scheduleAlarm called before permissions granted)
- task_completions purge running on every render instead of once on mount
- Date/time arithmetic bugs (timezone-naive Date comparisons, off-by-one in range queries)
- Settings keys not matching between write site and read site

### P2 — UX regressions acceptable to defer
- Minor layout/style issues
- Non-crash warning logs

## Acceptance criteria
- `npx tsc --noEmit` exits 0 with zero errors
- `npx jest --passWithNoTests --forceExit` exits 0, all 168+ tests pass
- All P0 and P1 bugs found are fixed and committed
- No new `any` types introduced
- Release APK builds successfully (`./gradlew assembleRelease --no-daemon`)
