# RandomTime — App Store & Play Store Metadata

## App Store (iOS)

**App Name:** RandomTime

**Subtitle:** Schedule Tasks at Random Times

**Category:** Productivity

**Version:** 1.3.0

**Short Description (30 chars):**
Random task scheduler

**Description (4000 chars max):**
```
Stop overthinking when to do things. RandomTime generates random times within a range you choose, so you can schedule tasks without decision fatigue.

📅 GENERATE RANDOM TIMES
Set a time range (e.g. 9 AM – 5 PM), tap Generate, and get a truly random time. Generate 1, 3, or 5 times at once. Copy to clipboard in 12h or 24h format.

⚡ ADVANCED GENERATION
- Weighted ranges: bias generation toward morning, afternoon, or any window
- Excluded blocks: skip lunch hour, sleep time, or any period you choose
- Presets: save your favourite range configurations and reload them in one tap

📆 CALENDAR & REMINDERS
Add generated times directly to your calendar as tasks. Set multiple reminders (5, 10, 15, 30 min or custom) before each event. A final alarm fires at event time.

🔔 SMART NOTIFICATIONS
Notification actions let you mark a task Done, Postpone to a new random time, or Snooze for 15 minutes — all without opening the app.

🔁 RECURRING TASKS
Mark tasks as Daily, Weekly, or a custom interval. Never miss a recurring commitment.

📋 TASK MANAGEMENT
- Categories: Work, Personal, Health, Other
- Priority: High, Medium, Low
- Notes on each task
- Search, filter, and sort your task list
- Bulk delete completed tasks

📊 STATISTICS
See total tasks, completed tasks, and your completion rate at a glance.

🌙 ONBOARDING
A friendly 4-step walkthrough gets you generating times in under 30 seconds.

RandomTime is built for people who procrastinate, overthinkers, habit builders, and anyone who wants a little randomness in their schedule.
```

**Keywords:**
random time, task scheduler, productivity, reminder, calendar, random, habit tracker, time picker, schedule, planner

**Privacy Policy URL:** https://randomtime.app/privacy
**Support URL:** https://randomtime.app/support

**Age Rating:** 4+

---

## Google Play (Android)

**App Name:** RandomTime — Task Scheduler

**Short Description (80 chars):**
Generate random times, schedule tasks, set reminders. No more decision fatigue.

**Full Description (4000 chars max):**
```
RandomTime takes the stress out of scheduling. Pick a time range, tap Generate — done. No overthinking, no decision fatigue.

🎲 RANDOM TIME GENERATOR
Generate truly random times within any range. Toggle between 12h and 24h formats. Copy to clipboard with one tap. View your last 10 generated times in history.

⚡ ADVANCED TIME GENERATION
Power users love:
• Weighted ranges — make morning times appear more often than afternoon
• Excluded blocks — never land on lunch hour or your commute window
• Presets — save named configurations and switch between them instantly

📅 CALENDAR INTEGRATION
Each generated time can become a calendar event. Set reminders at multiple intervals before the event. A final alarm fires at the exact scheduled time.

🔔 NOTIFICATION ACTIONS
From the notification tray:
• ✓ Done — mark the task complete
• ↻ Postpone — generate a new random time and reschedule
• 💤 Snooze 15 min — push the alarm 15 minutes forward

🔁 RECURRING SCHEDULES
Set any task to repeat Daily, Weekly, or every N days.

📋 FULL TASK MANAGEMENT
• Categories: Work / Personal / Health / Other
• Priority levels with colour coding
• Optional notes on each task
• Search by title
• Filter by status (Pending / Done)
• Sort by time, priority, or creation date
• Bulk delete with long-press multi-select
• Share tasks via any app

📊 COMPLETION STATISTICS
Track total tasks, done tasks, and your completion percentage.

All data stays on your device. No account required.
```

**Category:** Productivity

**Content Rating:** Everyone

**Tags:** productivity, scheduler, random, reminder, calendar, task manager

---

## Assets Checklist

### Icons
- [ ] `assets/icon.png` — 1024×1024px PNG, no transparency, no rounded corners (Apple rounds them)
- [ ] `assets/adaptive-icon.png` — 1024×1024px PNG foreground layer (safe zone: 66% center)
- [ ] `assets/splash-icon.png` — 1284×2778px (iPhone 14 Pro Max) or use `contain` resize with background colour

### Screenshots (iOS)
- [ ] iPhone 6.7" (1290×2796): Generator screen, Advanced panel, Task list, Onboarding, Stats
- [ ] iPhone 6.5" (1242×2688): Same 5 shots
- [ ] iPad Pro 12.9" (2048×2732): Same 5 shots (required if `supportsTablet: true`)

### Screenshots (Android)
- [ ] Phone (1080×1920 or 1440×3120): Generator, Task list, Notifications, Settings
- [ ] 7-inch tablet: Same shots
- [ ] 10-inch tablet: Same shots

### Feature Graphic (Android)
- [ ] 1024×500px banner for Play Store listing

---

## Compliance Notes

### iOS App Store
- Privacy manifest (`PrivacyInfo.xcprivacy`) required for Expo SDK 50+: declare SQLite (user-generated content), notifications
- No tracking → no ATT prompt needed
- Calendar and notification permissions described in `app.json` InfoPlist

### Google Play
- Target SDK 34+ (Expo SDK 52+ handles this)
- `SCHEDULE_EXACT_ALARM` declared in manifest — may require Play policy justification
- Data safety form: no data collected, no data shared

---

## EAS Build Commands

```bash
# Install EAS CLI
npm install -g eas-cli

# Login
eas login

# Configure project
eas build:configure

# Build for iOS TestFlight
eas build --platform ios --profile preview

# Build for Android internal testing
eas build --platform android --profile preview

# Submit to App Store
eas submit --platform ios

# Submit to Play Store
eas submit --platform android
```
