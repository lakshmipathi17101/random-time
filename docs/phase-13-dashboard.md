# Phase 13 — APK Slim + Progress Dashboard

**Date:** 2026-08-11
**Branch:** feat/phase-13-dashboard

---

## 1. APK ABI filter

The debug build previously bundled native libraries for all four ABI targets
(armeabi-v7a, arm64-v8a, x86, x86_64), yielding a ~120 MB APK. Adding
`ndk { abiFilters "arm64-v8a" }` to the debug build variant in
`android/app/build.gradle` restricts the debug APK to modern 64-bit ARM
hardware (all Android phones ≥ API 21 sold since ~2016), dropping the APK to
~28 MB. The release build is unaffected — it uses an AAB which Play Store
splits per device automatically.

---

## 2. Progress Dashboard — Architecture Decisions

### 2.1 Plain View bars, not react-native-svg

`react-native-svg` is absent from `package.json` dependencies. The requirements
called for checking before assuming. Because adding a native dependency in a
bare Expo workflow requires a full prebuild, the dashboard was implemented using
only React Native's built-in primitives:

- Grid cells: circular `View` components with `borderRadius`.
- Chart bars: `View` inside a fixed-height track, using `StyleSheet`-registered
  percentage heights/widths (see section 2.3 below).

This keeps the feature zero-new-dependencies and avoids an `expo prebuild` cycle.
If SVG charts are needed in a future phase, adding `react-native-svg` becomes a
standalone, planned change.

### 2.2 Week-collapse threshold (31 days)

The `WEEK_COLLAPSE_THRESHOLD` constant is set to 31. Any date range longer than
31 days collapses day columns into week columns in the grid and uses weekly
buckets in the chart. The rationale:

- Ranges of 7 d and 30 d fit comfortably as individual-day columns on a phone
  screen.
- 90 d and 1 y (365 d) would produce 90 or 365 columns — too narrow to tap and
  unreadable on a phone.
- 31 days is a natural upper bound for a "calendar month" and matches the user's
  original Excel layout (rows = habits, columns = day-of-month). Past that,
  weekly aggregation conveys useful trend information without being illegible.

In collapsed week mode, grid cells use a four-level opacity heatmap
(0 / 0.3 / 0.55 / 0.8 / 1.0) to indicate the proportion of days within the
week that were marked done.

### 2.3 buildPctStyles pre-registration pattern

React Native's `StyleSheet` API validates styles at registration time and
assigns integer IDs, which are more efficient than raw objects at render time.
The project rules prohibit inline styles (`StyleSheet.create()` is required for
all styles).

The chart and heatmap bars need data-driven percentage widths and heights
(0 % through 100 %). To satisfy both constraints, `buildPctStyles` registers
all 101 percentage values as named `StyleSheet` entries at module load time:

```ts
function buildPctStyles(prop: "width" | "height"): Record<string, ViewStyle> {
  const entries = [];
  for (let i = 0; i <= 100; i++) {
    entries.push([`p${i}`, prop === "width" ? { width: `${i}%` } : { height: `${i}%` }]);
  }
  return StyleSheet.create(Object.fromEntries(entries));
}

const widthPct = buildPctStyles("width");
const heightPct = buildPctStyles("height");
```

Render sites use `widthPct[`p${pct}`]` or `heightPct[`p${pct}`]`, where `pct`
is a 0–100 integer produced by `pctOf()`. No inline styles are created at
render time.

### 2.4 UTC vs local date convention (known limitation)

There is a deliberate inconsistency between the two date utilities:

| Location | Function | Convention |
|---|---|---|
| `ProgressDashboard.tsx` | `toDateStr(d)` | Local time (`getFullYear/getMonth/getDate`) |
| `db.ts` | `purgeOldCompletions()` | UTC (`toISOString().slice(0, 10)`) |

`toDateStr` was written in local time to match the user's expectation: when
they tap a cell for "today", it should reflect the calendar date they see on
their device, not a UTC date that may differ by one day in time zones ahead of
UTC.

`purgeOldCompletions` uses `toISOString()` because it was written during the
db.ts task before the local-time convention was established in the dashboard.
The practical effect is that in time zones ahead of UTC (e.g. UTC+5 and
beyond), `purgeOldCompletions` may retain one extra day of data beyond the
365-day window. This is a benign over-retention and does not affect correctness
of completions visible to the user.

A future cleanup should either make both UTC or both local, with a note in the
function's JSDoc explaining the chosen convention.

---

## 3. Data model

```sql
task_completions (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date    TEXT NOT NULL,   -- 'YYYY-MM-DD' in local time (see section 2.4)
  done    INTEGER NOT NULL DEFAULT 0,  -- 0=false, 1=true
  UNIQUE(task_id, date)
)
```

Key functions exposed from `db.ts`:

| Function | Behaviour |
|---|---|
| `upsertCompletion(taskId, date, done)` | INSERT OR REPLACE on `(task_id, date)` |
| `getCompletions(startDate, endDate)` | BETWEEN query, returns `Completion[]` |
| `purgeOldCompletions()` | DELETE WHERE date < today minus 365 days (UTC) |

`purgeOldCompletions` is called once on app mount via a `useEffect` in
`App.tsx` with no UI feedback — it is a silent housekeeping operation.

---

## 4. Test coverage

168 tests pass across 9 suites. The Phase 13 additions are in
`__tests__/progressDashboard.test.ts` and cover:

- Insert + range query (rows inside and outside the queried range)
- Upsert idempotency (same task+date called twice, no duplicate row)
- Purge retention boundary (rows at -366 days removed, -365 days kept)
- Inverted date range returns empty array

The mock simulates an in-memory Map to replicate SQLite's `ON CONFLICT` upsert
and date-range filtering without requiring a real database in the test runner.
