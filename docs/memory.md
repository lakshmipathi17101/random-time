# Memory — Project Status Tracker

## Current Status: Phases 1–6 Complete · Phase 7 landed · Phase 10 mostly complete · Phase 11.0 prebuild landed (bare workflow, `android/` materialized, no native module yet)

## Completed
- [x] Project initialized with Expo + TypeScript
- [x] App.tsx: random time generator, range, history
- [x] 12h / 24h format toggle, copy to clipboard
- [x] Upgraded to Expo SDK 54 (React 19, RN 0.81)
- [x] Calendar integration (expo-calendar)
- [x] Notification reminders (expo-notifications)
- [x] AddEventModal with task name + reminder chips + custom minutes + date picker
- [x] Permission handling for calendar and notifications
- [x] SQLite database (tasks + settings tables, WAL mode)
- [x] Dual notifications: reminder + alarm at exact event time
- [x] Saved Tasks list with delete (cancels notifications)
- [x] Settings persisted: 12h/24h toggle, time range
- [x] Android notification channels: reminders (HIGH) + alarms (MAX)
- [x] Phase 4: Mark task done (status, strike-through), notes, date picker, postpone, edit task, haptic feedback, categories (Work/Personal/Health/Other), priority (High/Medium/Low), search, sort (time/priority/created), filter (all/pending/done), bulk delete
- [x] Phase 5: Notification actions (Done / Postpone from tray), settings screen
- [x] Phase 6: Dark/light theme toggle, JSON export, enhanced statistics (done count, streak, completion rate, category breakdown), share task
- [x] Test infrastructure: jest + jest-expo, __tests__/db.test.ts (~30 cases), __tests__/notificationService.test.ts (~18 cases) — 48 tests passing
- [x] EAS build config (eas.json) — development / preview / production targets
- [x] babel.config.js + utils/timeUtils.ts extracted

## In Progress
- [x] Phase 7 — `weightedRandom.ts` engine + 3 built-in bias toggles (Work hours 9–17, Skip lunch 12–13, Skip sleep 22–07) wired into Generate, persisted to SQLite
- [x] Phase 7 — `utils/duration.ts` random duration engine + collapsible Home panel (min/max minutes persisted, copy-to-clipboard)
- [ ] Phase 7 — User-configurable Smart Range panel (custom weighted ranges + custom excluded blocks)
- [ ] Phase 7 — Presets save/load
- [ ] Phase 7 — Time zone support

## Phase 10 — ADHD Nudger Pivot (Mostly Complete)
- [x] `utils/streak.ts` — one-grace-per-7-days streak rule + 12 unit tests (`__tests__/streak.test.ts`)
- [x] `utils/scheduler.ts` — `planSurpriseMe`, `nudgeCountForEnergy` + 12 unit tests (`__tests__/scheduler.test.ts`)
- [x] `notificationService.ts` — new `pre_reminders` Android channel (DEFAULT importance, silent); `scheduleGentleNudge()`; object-form `setupNotificationResponseHandler` with optional `onReroll`; 6 new tests
- [x] `App.tsx` — Next Nudge card (1s countdown ticker), Energy check-in (once/day), Surprise Me button, celebration haptic scaling with streak, rewired postpone/reroll handlers
- [x] `AddEventModal.tsx` — Category + Priority + Notes moved behind "Advanced" disclosure; auto-opens when editing an existing task that has any of them set
- [x] `db.ts` — new `SettingKey`s: `energy_level`, `energy_date`, `pre_nudge_enabled`, `advanced_add_fields`
- [x] `docs/phase-10-adhd-nudger.md` — design sketch covering positioning, options considered, action items, success metrics
- [ ] Quick Capture FAB (voice + text) — deferred (needs Expo config plugin for native speech)
- [ ] Onboarding rewrite — deferred to Phase 11
- [ ] Hyperfocus exit nudge — deferred (needs BackgroundFetch)
- [ ] Store metadata rewrite for ADHD positioning — deferred

## Phase 4 — All Complete
(Both previously-open items turned out to already be implemented in App.tsx / AddEventModal.tsx — `×1/×3/×5` count chips and `selectedReminders[]` with `reminder_notification_ids` JSON.)

## Pending — Phase 8
- [ ] Recurring tasks (daily / weekdays / custom)
- [ ] Snooze alarm (delay N minutes from tray)
- [ ] Calendar conflict detection (avoid overlap with existing events)
- [ ] Full-screen alarm UI (requires dev build)

## Pending — Phase 9
- [ ] Onboarding screen (first-launch walkthrough)
- [ ] Home screen widget (Expo config plugin)
- [ ] iPad / tablet layout
- [ ] Accessibility — VoiceOver / TalkBack labels
- [ ] App icon assets (adaptive-icon.png, splash, icon, favicon) + store metadata

## Decisions Made
- Expo managed workflow (not bare)
- TypeScript strict, functional components only
- Dark theme default: `#0f0f1a` background, `#6c63ff` accent
- expo-sqlite singleton pattern (`getDb()` module-level)
- Calendar events created for selected date (date picker in AddEventModal)
- Service files: `calendarService.ts`, `notificationService.ts`, `db.ts`
- Main App.tsx is intentionally monolithic (1703 lines) — refactor into `components/` is a deferred item (see "Deferred Refactor" below)
- Canonical history lives on `main`; `feat/store-ready-sprint` and sibling `claude/*` branches were a parallel refactor fork and remain preserved but un-merged (unrelated histories)

## Deferred Refactor (not on a phase — technical debt)
A parallel development branch (`feat/store-ready-sprint`) contains a refactored file layout with `components/OnboardingScreen.tsx`, `SettingsPanel.tsx`, `StatsPanel.tsx`, `TaskList.tsx`, `TaskListItem.tsx`, `TimeInput.tsx`, `context/ThemeContext.tsx`, `hooks/useSettings.ts`, `hooks/useTasks.ts`, plus a separate `web/` Vite build. That layout is not currently integrated; the tests and `utils/timeUtils.ts` have been ported over, but the full component-split refactor is intentionally postponed to avoid disturbing Phase 4-6 surface area during Phase 7-9 delivery. Revisit after Phase 9 ship.

## Key Files
- `App.tsx` — Main app entry and UI (ThemeContext, makeStyles, calcStreak, export JSON, task list, filter/sort/search, bulk delete, postpone, edit)
- `AddEventModal.tsx` — Modal for adding/editing tasks (theme-aware, date picker, category, priority, notes)
- `theme.ts` — AppTheme interface, DARK and LIGHT theme constants
- `calendarService.ts` — Calendar permission + event creation
- `notificationService.ts` — Notification permission + scheduling (reminder + alarm + Done/Postpone action handlers)
- `db.ts` — SQLite schema, all queries, Task/TaskCategory/TaskPriority/SettingKey types
- `utils/timeUtils.ts` — Time formatting helpers (pad, clamp, format12/24)
- `weightedRandom.ts` — Phase 7 engine: `generateWeightedRandom`, `buildBiasConfig`, `WORK_HOURS_BIAS` / `LUNCH_BLOCK` / `SLEEP_BLOCKS` constants
- `utils/streak.ts` — Phase 10 streak with one-grace-per-7-days rule: `calcStreakWithGrace`, `calcStreak` (legacy-compat), `doneDayKeys`
- `utils/scheduler.ts` — Phase 10 Surprise Me: `planSurpriseMe`, `nudgeCountForEnergy`, `EnergyLevel` type
- `utils/duration.ts` — Phase 7 random duration: `generateRandomDuration`, `formatDuration`, `endTime`, `validateDurationBounds`, `MAX_DURATION_MINUTES`
- `utils/focusSession.ts` — Phase 11 pure session logic: `isActive`, `isExpired`, `isPackageBlocked`, `timeRemainingMs/Seconds`, `canEmergencyUnlock`, `formatRemaining`, `makePendingSession`
- `types/appControl.ts` — Phase 11 native module contract (TypeScript types only, no runtime). `AppControlNative`, `InstalledApp`, `UsageRow`, `PermissionStatus`, `FocusSession`, etc.
- `nativeAppControl.ts` — Phase 11 facade. Today dispatches to in-memory mock so JS UI / tests can be written before the Kotlin module exists. `isAppControlAvailable()` is hard-wired to false until prebuild lands.
- `__tests__/db.test.ts` — DB unit tests
- `__tests__/notificationService.test.ts` — Notification unit tests (29 cases, incl. Phase 10 reroll + pre-nudge)
- `__tests__/weightedRandom.test.ts` — Phase 7 engine tests (21 cases)
- `__tests__/streak.test.ts` — Phase 10 streak tests (12 cases)
- `__tests__/scheduler.test.ts` — Phase 10 surprise-me / energy tests (12 cases)
- `__tests__/duration.test.ts` — Phase 7 random-duration tests (20 cases)
- `__tests__/focusSession.test.ts` — Phase 11 pure session-logic tests (26 cases)
- `__tests__/nativeAppControl.test.ts` — Phase 11 mock facade tests (16 cases)
- `eas.json` — EAS build profiles (dev / preview / prod)
- `babel.config.js` — babel-preset-expo
- `CLAUDE.md` — Project rules
- `docs/plan.md` — Full 9-phase roadmap
- `docs/memory.md` — This file
- `docs/test-plan.md` — Manual test checklist
- `docs/use-cases.md` — Use case descriptions
- `docs/phase-10-adhd-nudger.md` — Phase 10 design sketch (ADHD nudger pivot)
- `docs/phase-11-app-control.md` — Phase 11 design sketch (app-control pivot, Accessibility Service + overlay, two build flavors)

## Recent Events
- 2026-04-21 — Ported tests, eas.json, babel.config.js, utils/timeUtils.ts from parallel `feat/store-ready-sprint` refactor branch. Extended `updateTaskTime` in db.ts with optional `reminder_notification_ids` param. All 48 tests pass, `tsc --noEmit` clean.
- 2026-04-21 — Plan and memory reconciled with actual code state: Phase 4 and Phase 5 now correctly marked complete.
- 2026-04-21 — Phase 7 begun: `weightedRandom.ts` engine added with 21 unit tests; three persistent bias toggles landed in Generate row; `generate()` now delegates to `generateWeightedRandom()`. All 69 tests pass, `tsc --noEmit` clean.
- 2026-04-24 — Phase 10 (ADHD nudger pivot) design doc added: `docs/phase-10-adhd-nudger.md`. Evaluated three options (full rewrite / in-place re-framing / optional mode), chose in-place re-framing.
- 2026-04-24 — Phase 10 implementation landed: streak-with-grace, pre-nudge tier, Re-roll action, Next Nudge countdown card, Energy check-in, Surprise Me, Advanced disclosure in AddEventModal, scaled celebration haptic. 30 new tests; all 99 tests pass, `tsc --noEmit` clean. App.tsx: 1817 → 2193 lines.
- 2026-04-27 — Phase 7 random duration generator landed: `utils/duration.ts` (engine + format helpers + validator) with 20 unit tests. New collapsible "Random duration" panel on Home with min/max minute inputs persisted to SQLite (`duration_min_minutes` / `duration_max_minutes`) and copy-to-clipboard. All 119 tests pass, `tsc --noEmit` clean.
- 2026-04-27 — Phase 11 (App-control pivot) designed: `docs/phase-11-app-control.md`. Chose Accessibility Service + overlay + two build flavors (`playStoreLite` UsageStats-only / `sideloadFull` with blocker) on Expo prebuild (bare workflow) + Kotlin native module. Architecture, permission UX, data model, 6-step phasing, risks, and open questions captured. No code changes yet — `expo prebuild` is a one-way door so we commit current state first.
- 2026-04-27 — Phase 11 JS-side scaffolding landed (no native module yet, still managed Expo): `types/appControl.ts` (full Kotlin module contract as TS types), `utils/focusSession.ts` (pure session logic: 26 tests), `nativeAppControl.ts` (mock facade behind `isAppControlAvailable()` flag, 16 tests). All 161 tests pass, `tsc --noEmit` clean. Existing app surface untouched. Committed as `f4516aa` (Phase 10 + 7) and `8816cb8` (Phase 11 prep).
- 2026-05-16 — Phase 11.0 `expo prebuild --platform android` landed. Bare workflow now. `android/` directory contains Kotlin MainApplication/MainActivity + AndroidManifest.xml that already declares `SYSTEM_ALERT_WINDOW` (RN baseline). Stripped broken `./assets/*.png` references from `app.json` (Phase 9 deferred icon work — files never existed); prebuild added `android.package=com.anonymous.randomtime` and rewrote `package.json`'s `android`/`ios` scripts to `expo run:*`. All 161 tests still pass, `tsc --noEmit` clean. Note: actual Android build (`expo run:android`) cannot be exercised from this sandbox — no Android SDK; will require user's machine.
