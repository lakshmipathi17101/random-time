# Memory — Project Status Tracker

## Current Status: Phase 6 Complete — Phase 7 next

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

## In Progress
- [ ] Phase 7 — Time Generation Advanced

## Decisions Made
- Expo managed workflow (not bare)
- TypeScript strict, functional components only
- Dark theme with #0f0f1a background, #6c63ff accent
- expo-sqlite singleton pattern (getDb() module-level)
- Calendar events created for today by default (date picker coming in Phase 4)
- Service files: calendarService.ts, notificationService.ts, db.ts

## Key Files
- `App.tsx` — Main app entry and UI (ThemeContext, makeStyles, calcStreak, export JSON)
- `AddEventModal.tsx` — Modal for adding/editing calendar events (theme-aware)
- `theme.ts` — AppTheme interface, DARK and LIGHT theme constants
- `calendarService.ts` — Calendar permission + event creation
- `notificationService.ts` — Notification permission + scheduling (reminder + alarm)
- `db.ts` — SQLite schema, all queries, Task type, SettingKey type
- `CLAUDE.md` — Project rules
- `docs/plan.md` — Full 9-phase roadmap
- `docs/memory.md` — This file
- `docs/test-plan.md` — Manual test checklist
- `docs/use-cases.md` — Use case descriptions
