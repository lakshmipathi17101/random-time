# Memory — Project Status Tracker

## Current Status: Phase 5 complete — Phases 6-9 pending

## Completed
- [x] Project initialized with Expo + TypeScript
- [x] App.tsx: random time generator, range, history
- [x] 12h / 24h format toggle, copy to clipboard
- [x] Upgraded to Expo SDK 54 (React 19, RN 0.81)
- [x] Calendar integration (expo-calendar)
- [x] Notification reminders (expo-notifications)
- [x] AddEventModal with task name + reminder chips + custom minutes
- [x] Permission handling for calendar and notifications
- [x] SQLite database (tasks + settings tables, WAL mode)
- [x] Dual notifications: reminder + alarm at exact event time
- [x] Saved Tasks list with delete (cancels notifications)
- [x] Settings persisted: 12h/24h toggle, time range
- [x] Android notification channels: reminders (HIGH) + alarms (MAX)
- [x] docs/test-plan.md created
- [x] docs/plan.md updated with all 9 phases

## Phase 4 Completed Features
- [x] Mark task done (checkbox, strike-through, persisted)
- [x] Task notes/description
- [x] Date picker (future dates)
- [x] Postpone task (new random time)
- [x] Edit task (pre-filled modal)
- [x] Haptic feedback throughout
- [x] Multiple reminders per task (multi-select chips)
- [x] Task categories + priority (Work/Personal/Health/Other, High/Medium/Low)
- [x] Search, filter (All/Pending/Done), sort (Time/Priority/Created)
- [x] Bulk delete (long-press selection)
- [x] Multiple times at once (×1/×3/×5)
- [x] Share task (native Share sheet)
- [x] Statistics section (total, done, completion %)

## Phase 5 Completed Features
- [x] Settings panel (default reminder, delete all done)
- [x] Notification action buttons: Done + Postpone from tray
- [x] scheduleAlarm embeds taskId for action routing

## In Progress
- [ ] Phases 6-9 — remaining roadmap items

## Decisions Made
- Expo managed workflow (not bare)
- TypeScript strict, functional components only
- Dark theme with #0f0f1a background, #6c63ff accent
- expo-sqlite singleton pattern (getDb() module-level)
- Calendar events created for today by default (date picker coming in Phase 4)
- Service files: calendarService.ts, notificationService.ts, db.ts

## Key Files
- `App.tsx` — Main app entry and UI
- `AddEventModal.tsx` — Modal for adding calendar events
- `calendarService.ts` — Calendar permission + event creation
- `notificationService.ts` — Notification permission + scheduling (reminder + alarm)
- `db.ts` — SQLite schema, all queries, Task type, SettingKey type
- `CLAUDE.md` — Project rules
- `docs/plan.md` — Full 9-phase roadmap
- `docs/memory.md` — This file
- `docs/test-plan.md` — Manual test checklist
- `docs/use-cases.md` — Use case descriptions
