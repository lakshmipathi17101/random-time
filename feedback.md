APPROVED

**random-time-gxl.2.5 — Progress Dashboard integration tests**

All four required acceptance criteria are satisfied:

1. **Insert + range query (AC 1)**: `describe("upsertCompletion + getCompletions") > it("inserts a row and getCompletions returns it for the matching date range")` inserts task 1 for today and asserts `getCompletions(date, date)` returns exactly one row with `{ taskId: 1, date, done: true }`. A companion test verifies a row outside the queried range is NOT returned.

2. **Upsert idempotency (AC 2)**: `describe("upsertCompletion idempotency") > it("calling upsertCompletion twice on the same task+date updates the row instead of duplicating it")` calls upsertCompletion twice on the same (task 10, today), then asserts length is 1 and `done` flipped to `true`.

3. **Purge removes old, keeps today (AC 3)**: `describe("purgeOldCompletions") > it("removes a row dated 366+ days ago and leaves a row dated today")` inserts rows at -366 days and today, purges, then asserts only today remains. A boundary test additionally confirms a row at exactly -365 days (equal to the cutoff) is NOT deleted, which correctly reflects the strict `<` in the DELETE SQL.

4. **startDate > endDate returns empty (AC 4)**: `describe("getCompletions edge cases") > it("returns an empty array when startDate is after endDate")` passes `(today, yesterday)` and expects `[]`. The mock's `row.date >= startDate && row.date <= endDate` filter correctly produces the same behaviour as SQL BETWEEN for an inverted range.

**Infrastructure**: The stateful in-memory Map mock correctly simulates ON CONFLICT upsert (overwrite), date-ranged SELECT (filter), and date-filtered DELETE (iterate and remove). `beforeEach` resets the store without wiping jest mock implementations, avoiding a common brittle pattern.

**Build gates**: `npx jest --watchAll=false` — 168/168 tests pass across 9 suites. `npx tsc --noEmit` — no errors.

**File hygiene**: Commit `110055f` adds exactly one file (`__tests__/progressDashboard.test.ts`). No unrelated artefacts.

reopenIds: []
newTasks: []
