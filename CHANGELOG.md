# Changelog

## Phase 13 — APK Slim + Progress Dashboard (2026-08-11)

**Sprint goal:** Reduce the debug APK from ~120 MB to ~28 MB by restricting the
native ABI to arm64-v8a, and ship a Progress Dashboard screen so users can track
and visualise habit completions without leaving the app.

### Delivered

- **APK ABI filter** (`android/app/build.gradle`): `ndk { abiFilters "arm64-v8a" }`
  added to the debug build variant. Debug APK shrinks from ~120 MB to ~28 MB.
  Release AAB is unchanged (Play Store splits per device).

- **task_completions table** (`db.ts`): new SQLite table recording per-task,
  per-day done/not-done state. Exposed as `upsertCompletion`, `getCompletions`,
  and `purgeOldCompletions`. Auto-purge of rows older than 365 days runs on app
  mount.

- **ProgressDashboard screen** (`ProgressDashboard.tsx`): tab-switched Grid and
  Chart views with a shared 7 d / 30 d / 90 d / 1 y date-range selector.
  Grid view: rows = tasks, columns = days or weeks (collapses to weeks above
  31 days), tappable cells toggle completion. Chart view: vertical bars by
  day/week plus per-task horizontal progress bars. Implemented using plain
  React Native `View` primitives — no new npm dependencies.

- **Progress tab** (`App.tsx`): Progress tab added to the existing bottom
  navigation alongside Tasks and History.

- **Integration tests** (`__tests__/progressDashboard.test.ts`): 168/168 tests
  pass across 9 suites. New suite covers upsert, range query, purge boundary,
  and inverted-range edge case.

### Items carried forward

None. All sprint tasks closed.
