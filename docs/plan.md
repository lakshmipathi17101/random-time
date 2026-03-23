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

## Phase 4: Task Enhancements (In Progress)
> Richer task management and UX

- [ ] Mark task as done (checkbox, visual strike-through, persist status)
- [ ] Task notes/description (optional multi-line text on each task)
- [ ] Date picker (create tasks for future dates, not just today)
- [ ] Postpone task (reschedule to new random time, cancel old notifications)
- [ ] Edit task (change title, date, time, reminder after saving)
- [ ] Haptic feedback on generate and key interactions
- [ ] Multiple reminders per task (e.g. 30 min + 10 min + 5 min before)
- [ ] Task categories / tags (Work, Personal, Health, etc.)
- [ ] Task priority (High / Medium / Low with colour indicator)
- [ ] Search tasks (filter list by title)
- [ ] Sort tasks (by time, date, priority, creation)
- [ ] Filter tasks (by status: pending / done; by category; by date)
- [ ] Bulk delete (select multiple tasks, delete all done / all past)
- [ ] Multiple times at once (generate 3–5 random times in one tap)

---

## Phase 5: Notifications & Alarms Advanced
> Power notification and alarm features

- [ ] Notification actions — tap "Done" or "Postpone" from the notification tray
- [ ] Postpone from notification re-generates a new random time and reschedules
- [ ] Recurring tasks (daily, weekdays, custom days)
- [ ] Full-screen alarm UI when event time arrives (requires dev build)
- [ ] Snooze alarm (delay by N minutes)
- [ ] Sound selection (pick notification/alarm sound)
- [ ] App icon badge showing count of upcoming tasks

---

## Phase 6: Settings & Sharing (Complete)
> User preferences and data portability

- [x] Settings screen (default reminder time, theme, time format, sound)
- [x] Dark/light theme toggle (user-selectable, persisted)
- [x] Share task (share generated time or task as text / calendar invite)
- [x] Export tasks as JSON (backup to Files app / Google Drive)
- [x] Statistics screen (tasks completed, streak 🔥, completion rate, category breakdown)

---

## Phase 7: Time Generation Advanced
> More powerful random time options

- [ ] Weighted random (bias toward certain hours, e.g. work hours 9–17)
- [ ] Exclude time blocks (e.g. skip lunch 12–13, skip sleep 22–07)
- [ ] Random duration generator (not just a fixed time)
- [ ] Time zone support (generate in a chosen time zone)

---

## Phase 8: Calendar Intelligence
> Smarter calendar integration

- [ ] Read existing calendar events to avoid conflicts
- [ ] Recurring calendar events (not just one-off)
- [ ] Show calendar event acceptance/decline status in task list

---

## Phase 9: Polish & Platform
> Platform-specific features and final polish

- [ ] Onboarding screen (brief walkthrough on first launch)
- [ ] Home screen widget for quick generate (requires Expo config plugin)
- [ ] iPad / tablet layout
- [ ] Accessibility (VoiceOver / TalkBack support)
