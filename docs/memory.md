# Memory — Project Status Tracker

## Current Status: Phase 2 — Calendar + Notifications (Complete)

## Completed
- [x] Project initialized with Expo + TypeScript
- [x] App.tsx created with random time generator UI
- [x] Time range inputs (From/To) with HH:MM:SS
- [x] Generate button with validation
- [x] Dark theme UI with purple accent
- [x] 12h / 24h format toggle
- [x] Copy generated time to clipboard
- [x] History of last 10 generated times (with clear)
- [x] Upgraded to Expo SDK 54 (React 19, RN 0.81)
- [x] Calendar integration (expo-calendar)
- [x] Notification reminders (expo-notifications)
- [x] AddEventModal with task name + reminder chips
- [x] Permission handling for calendar and notifications
- [x] Docs folder created with use cases
- [x] CLAUDE.md created with project rules
- [x] plan.md created with phased roadmap

## In Progress
- [ ] Phase 3 — Task Persistence & Management (not started)

## Decisions Made
- Expo managed workflow (not bare)
- TypeScript over JavaScript
- Dark theme with #0f0f1a background, #6c63ff accent
- Calendar events created for today's date only
- Reminder presets: 5, 10, 15, 30 min (no custom input)
- Service files split out from App.tsx for calendar/notifications

## Key Files
- `App.tsx` — Main app entry and UI
- `AddEventModal.tsx` — Modal for adding calendar events
- `calendarService.ts` — Calendar permission + event creation
- `notificationService.ts` — Notification permission + scheduling
- `CLAUDE.md` — Project rules for Claude
- `docs/use-cases.md` — Use case list
- `docs/memory.md` — This file (status tracker)
- `docs/plan.md` — Phased roadmap
