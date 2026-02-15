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

## Phase 3: Task Persistence & Management
> Persist tasks and manage them in-app

- [ ] Persist tasks with AsyncStorage
- [ ] Task list view (time + task pairs)
- [ ] Edit / delete tasks
- [ ] Mark tasks as done / postpone
- [ ] Action buttons on notification: "Done" / "Postpone"
- [ ] Postpone re-generates a new random time and reschedules

---

## Phase 4: Alarms
> Alarm-style alerts that require user interaction to dismiss

- [ ] Install and configure alarm capabilities
- [ ] Full-screen alarm UI when time is reached
- [ ] Sound/vibration on alarm trigger
- [ ] Snooze / dismiss options
- [ ] Recurring random alarms (daily, weekdays, custom)

---

## Phase 5: Polish & Extras
> UX improvements and additional features

- [ ] Onboarding / tutorial screens
- [ ] Settings screen (theme, sound, defaults)
- [ ] Multiple time zones support
- [ ] Widget for home screen (quick generate)
- [ ] Export/share generated schedules
- [ ] Dark/light theme toggle
