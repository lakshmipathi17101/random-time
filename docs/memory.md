# Memory — Project Status Tracker

## Current Status: Phases 1–6 Complete — Phase 7 started (engine + built-in toggles landed)

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
- [ ] Phase 7 — User-configurable Smart Range panel (custom weighted ranges + custom excluded blocks)
- [ ] Phase 7 — Presets save/load
- [ ] Phase 7 — Random duration generator
- [ ] Phase 7 — Time zone support

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
- `__tests__/db.test.ts` — DB unit tests
- `__tests__/notificationService.test.ts` — Notification unit tests
- `__tests__/weightedRandom.test.ts` — Phase 7 engine tests (21 cases)
- `eas.json` — EAS build profiles (dev / preview / prod)
- `babel.config.js` — babel-preset-expo
- `CLAUDE.md` — Project rules
- `docs/plan.md` — Full 9-phase roadmap
- `docs/memory.md` — This file
- `docs/test-plan.md` — Manual test checklist
- `docs/use-cases.md` — Use case descriptions

## Recent Events
- 2026-04-21 — Ported tests, eas.json, babel.config.js, utils/timeUtils.ts from parallel `feat/store-ready-sprint` refactor branch. Extended `updateTaskTime` in db.ts with optional `reminder_notification_ids` param. All 48 tests pass, `tsc --noEmit` clean.
- 2026-04-21 — Plan and memory reconciled with actual code state: Phase 4 and Phase 5 now correctly marked complete.
- 2026-04-21 — Phase 7 begun: `weightedRandom.ts` engine added with 21 unit tests; three persistent bias toggles landed in Generate row; `generate()` now delegates to `generateWeightedRandom()`. All 69 tests pass, `tsc --noEmit` clean.
