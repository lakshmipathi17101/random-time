# Phase 13 Requirements — APK Slim + Progress Dashboard

## Context

RandomTime is a React Native (Expo SDK 52, bare workflow) habit-reminder app targeting
Android. The debug APK is 120 MB due to native libraries bundled for all four CPU
architectures. The app currently has no progress tracking — users add tasks and get
overlay alarm reminders, but there is no way to mark tasks done for a given day or
see their completion history.

The user tracks habits in an Excel spreadsheet (rows = habits, columns = day-of-month,
cells = TRUE/FALSE, totals per habit at the row end) and wants this inside the app
with charts.

## Feature 1 — APK ABI split (chore)

Add `abiFilters "arm64-v8a"` to the debug build variant in
`android/app/build.gradle`. This limits the debug APK to the arm64-v8a ABI (covers
all modern Android phones ≥ API 21). Expected result: APK shrinks from ~120 MB to
~28 MB. The release build is unchanged (it already uses AAB on Play Store, which
auto-splits per device).

### Acceptance

- `android/app/build.gradle` debug variant has `ndk { abiFilters "arm64-v8a" }` under
  `buildTypes.debug`.
- File passes `npx tsc --noEmit` (no TS changes needed, but verify).
- No other build files changed.

## Feature 2 — Progress Dashboard screen

### Data model

Add a `task_completions` SQLite table to `db.ts`:

```
task_completions (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id   INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date      TEXT NOT NULL,   -- ISO-8601 date "YYYY-MM-DD"
  done      INTEGER NOT NULL DEFAULT 0  -- 0=false, 1=true
  UNIQUE(task_id, date)
)
```

Expose these functions from `db.ts`:
- `upsertCompletion(taskId: number, date: string, done: boolean): Promise<void>`
- `getCompletions(startDate: string, endDate: string): Promise<Completion[]>`
  where `Completion = { taskId: number; date: string; done: boolean }`
- `purgeOldCompletions(): Promise<void>` — deletes rows where date < today minus 365 days

Call `purgeOldCompletions()` once on app startup (in `App.tsx` useEffect).

### Dashboard screen

Add a new **"Progress"** tab to the app (bottom tab or top tab, matching the existing
nav style). The screen has two views toggled by a segmented control or two tabs:

**Grid view** (default, matches the Excel layout):
- Rows = tasks (task name as row header)
- Columns = days in the selected range, shown as day numbers
- Cell = filled circle (done) or empty circle (not done), tappable to toggle
- Selecting a range longer than 31 days collapses columns to weeks instead of days
- Row tail: total completions count for the selected range

**Chart view**:
- One line per task showing daily completion rate (0 or 1 per day) over the selected range
- Or a stacked/grouped bar chart per week for ranges > 31 days
- Keep it readable with ≤ 8 tasks visible; scroll if more

**Date-range selector** (shared between both views):
- Segmented control: 7d | 30d | 90d | 1y (default 30d)
- Range is always "last N days ending today"

### Auto-purge

`purgeOldCompletions()` called in `App.tsx` useEffect on mount. No UI needed.

### Constraints

- No new npm packages — use React Native's built-in `ScrollView`, `FlatList`, and
  `StyleSheet`. For charts, implement a simple SVG-based line chart inline (React
  Native's `react-native-svg` is already in the Expo SDK; check `package.json`
  before assuming — if absent, build with plain `View`/absolute-position bars).
- Follow existing theme from `theme.ts`.
- TypeScript strict mode throughout.
- Run `npx tsc --noEmit` before closing any task.
