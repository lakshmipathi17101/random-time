# Plan — RandomTime Roadmap

## Phase 1: Core — Random Time Generator (Complete)
> Simple time generator with range support

- [x] Generate random time in HH:MM:SS format
- [x] Set min/max time range (From / To)
- [x] Input validation (min <= max)
- [x] Dark theme UI
- [x] 12h / 24h format toggle
- [x] Copy generated time to clipboard
- [x] History of last 10 generated times (with clear)

---

## Phase 2: Calendar + Notifications (Complete)
> Create calendar events with notification reminders

- [x] Install and configure `expo-calendar`
- [x] Install and configure `expo-notifications`
- [x] "Add to Calendar" button after generating time
- [x] Modal with task name input
- [x] Reminder selector chips (5 / 10 / 15 / 30 min)
- [x] Create calendar event for today at generated time
- [x] Schedule local notification X minutes before event
- [x] Permission handling for calendar and notifications
- [x] Past-time graceful handling

---

## Phase 3: Task Persistence & Management (Complete)
> SQLite persistence, dual notifications, task list

- [x] expo-sqlite: tasks and settings tables (WAL mode)
- [x] Tasks persisted: title, time, reminder ID, alarm ID, calendar event ID
- [x] Settings persisted: 12h/24h toggle, time range
- [x] Dual notifications: reminder X min before + alarm at exact event time
- [x] Custom reminder minutes input alongside preset chips
- [x] Saved Tasks list with delete (cancels scheduled notifications)
- [x] Android: separate HIGH/MAX importance channels for reminders vs alarms

---

## Phase 4: Task Enhancements (Complete)
> Richer task management and UX

- [x] Mark task as done (checkbox, visual strike-through, persist status)
- [x] Task notes/description (optional multi-line text on each task)
- [x] Date picker (create tasks for future dates, not just today)
- [x] Postpone task (reschedule to new random time, cancel old notifications)
- [x] Edit task (change title, date, time, reminder after saving)
- [x] Haptic feedback on generate and key interactions
- [x] Multiple reminders per task (e.g. 30 min + 10 min + 5 min before) — wired via `selectedReminders[]` and `reminder_notification_ids` JSON column
- [x] Task categories / tags (Work, Personal, Health, Other)
- [x] Task priority (High / Medium / Low with colour indicator)
- [x] Search tasks (filter list by title)
- [x] Sort tasks (by time, priority, creation)
- [x] Filter tasks (by status: pending / done)
- [x] Bulk delete (select multiple tasks, delete all done)
- [x] Multiple times at once (×1 / ×3 / ×5 chips, each result individually copyable + addable to calendar)

---

## Phase 5: Notifications & Alarms Advanced (Mostly Complete)
> Power notification and alarm features

- [x] Notification actions — tap "Done" or "Postpone" from the notification tray
- [x] Postpone from notification re-generates a new random time and reschedules
- [ ] Recurring tasks (daily, weekdays, custom days) — moved to Phase 8 (see below)
- [ ] Full-screen alarm UI when event time arrives (requires dev build) — deferred to Phase 8
- [ ] Snooze alarm (delay by N minutes) — moved to Phase 8
- [ ] Sound selection (pick notification/alarm sound)
- [ ] App icon badge showing count of upcoming tasks

---

## Phase 6: Settings & Sharing (Complete)
> User preferences and data portability

- [x] Settings screen (default reminder time, theme, time format, sound)
- [x] Dark/light theme toggle (user-selectable, persisted)
- [x] Share task (share generated time or task as text / calendar invite)
- [x] Export tasks as JSON (backup to Files app / Google Drive)
- [x] Statistics screen (tasks completed, streak, completion rate, category breakdown)

---

## Phase 7: Time Generation Advanced (In Progress)
> More powerful random time options

- [x] **Weighted random + excluded blocks engine** — `weightedRandom.ts` with `generateWeightedRandom`, `WeightedRange`, `ExcludedBlock`, `buildBiasConfig`. 21 unit tests.
- [x] Built-in bias toggles wired into Generate flow — "Work hours 9–17", "Skip lunch", "Skip sleep" chips, persisted via SQLite settings (`work_hours_bias` / `skip_lunch` / `skip_sleep` keys)
- [ ] User-configurable weighted ranges (add/remove multiple `[start,end,weight]` entries in a "Smart Range" panel)
- [ ] User-configurable excluded blocks (add/remove multiple `[start,end]` entries)
- [ ] Presets — save / load named configs of (range + weights + exclusions)
- [ ] Random duration generator (not just a fixed time — pick a length between N and M minutes)
- [ ] Time zone support (generate in a chosen time zone)

---

## Phase 8: Notifications Advanced + Calendar Intelligence
> Scheduling power-ups + smart calendar integration

- [ ] Recurring tasks (daily, weekdays, custom days)
- [ ] Snooze alarm (5 / 10 / 15 min from notification tray)
- [ ] Calendar conflict detection (avoid overlap with existing events)
- [ ] Full-screen alarm UI (requires dev build)
- [ ] Read existing calendar events to avoid conflicts
- [ ] Recurring calendar events (not just one-off)

---

## Phase 9: Polish & Platform
> Platform-specific features and final polish

- [ ] Onboarding screen (brief walkthrough on first launch)
- [ ] Home screen widget for quick generate (Expo config plugin)
- [ ] iPad / tablet layout
- [ ] Accessibility (VoiceOver / TalkBack support)
- [ ] App icon assets (adaptive-icon.png, splash, icon, favicon)
- [ ] Play Store / App Store listing metadata (`docs/store-metadata.md`)
- [ ] App icon badge showing count of upcoming tasks

---

## Technical Debt — Deferred
- Component refactor: extract from monolithic `App.tsx` into `components/`, `hooks/`, `context/` (prototype on `feat/store-ready-sprint`)
- Web build (`web/` Vite target from the refactor branch) — only if web deployment is desired
- Remote branch cleanup: 6 duplicate `claude/*` branches (clever-kilby, gifted-hoover, hopeful-gould, pensive-feistel, sad-knuth, serene-nobel) should be deleted on GitHub — they share 0 unique commits with `merge/aibarracks-playstore`
