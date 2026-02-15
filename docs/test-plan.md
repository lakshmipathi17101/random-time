# Test Plan — RandomTime App

Use this document to manually verify the app after all Phase 4–9 features are implemented.
Run through each section top to bottom on a **physical Android or iOS device** (not web — notifications and calendar require a real device).

---

## 0. Setup

- [ ] Install the app on a physical device via Expo Go (or dev build)
- [ ] Grant calendar permission when prompted
- [ ] Grant notification permission when prompted
- [ ] Confirm app opens without errors

---

## 1. Core Time Generation

| # | Action | Expected Result |
|---|--------|----------------|
| 1.1 | Open app fresh | From: 00:00:00, To: 23:59:59 displayed |
| 1.2 | Tap Generate | A random time appears in HH:MM:SS |
| 1.3 | Set From > To, tap Generate | Error: "Min time must be less than or equal to max time" |
| 1.4 | Set same From and To, tap Generate | Result equals that exact time every time |
| 1.5 | Tap Generate 10 times | All results stay within the set range |
| 1.6 | Toggle 24H → 12H | Result and history re-render in 12h format with AM/PM |
| 1.7 | Toggle back to 24H | Switches back correctly |
| 1.8 | Tap Copy | "Copied!" shows for 2s, paste elsewhere confirms correct value |
| 1.9 | Generate 11 times | History shows max 10 entries (oldest drops off) |
| 1.10 | Tap Clear on history | History empties |
| 1.11 | Generate multiple times | Multiple times at once generates 3–5 results in one tap |

---

## 2. Settings Persistence

| # | Action | Expected Result |
|---|--------|----------------|
| 2.1 | Set From to 08:00:00 and To to 17:00:00 | Values shown correctly |
| 2.2 | Toggle to 12H | Shows 12H |
| 2.3 | Close and reopen the app | From/To and 12H/24H toggle all restored exactly |
| 2.4 | Change default reminder to 20 min on settings screen | Persists after restart |
| 2.5 | Change theme to light | Light theme shown, persists after restart |

---

## 3. Add to Calendar / Task Creation

| # | Action | Expected Result |
|---|--------|----------------|
| 3.1 | Generate a time, tap "Add to Calendar" | Modal slides up |
| 3.2 | Leave task name empty, tap Save | Alert: "Please enter a task name" |
| 3.3 | Enter task name, select 10 min chip, tap Save | Event created in device calendar, reminder notification scheduled |
| 3.4 | Open device calendar | Event exists at today's date and generated time |
| 3.5 | Type "45" in custom minutes field | 10 min chip deselects, custom value used |
| 3.6 | Clear custom minutes, select 5 min chip, save | 5 min chip highlighted and used |
| 3.7 | Create task with future date using date picker | Event created on correct future date |
| 3.8 | Create task for a past time today | Alert: event saved but no notifications scheduled (time passed) |
| 3.9 | Add a note to the task | Note visible on task detail / task list |

---

## 4. Saved Tasks List

| # | Action | Expected Result |
|---|--------|----------------|
| 4.1 | After creating a task | Task appears in Saved Tasks list |
| 4.2 | Close and reopen app | Task still in list (SQLite persisted) |
| 4.3 | Tap checkbox / Done on a task | Task shows strike-through, marked done |
| 4.4 | Tap Delete on a task | Confirmation Alert appears |
| 4.5 | Confirm delete | Task removed from list |
| 4.6 | Verify device calendar | Calendar event for deleted task is gone |
| 4.7 | After delete | Any scheduled notifications for deleted task are cancelled |
| 4.8 | Tap Edit on a task | Edit modal pre-filled with existing values |
| 4.9 | Change title and save | Task list updates with new title |
| 4.10 | Postpone a task | New random time generated within original range, old notifications cancelled, new ones scheduled |

---

## 5. Task Filtering & Search

| # | Action | Expected Result |
|---|--------|----------------|
| 5.1 | Type in search bar | List filters to matching task titles in real time |
| 5.2 | Clear search | Full list restored |
| 5.3 | Filter by "Done" | Only completed tasks shown |
| 5.4 | Filter by "Pending" | Only incomplete tasks shown |
| 5.5 | Filter by category "Work" | Only Work-tagged tasks shown |
| 5.6 | Sort by Priority | High priority tasks appear first |
| 5.7 | Sort by Time | Tasks ordered by event time ascending |
| 5.8 | Select multiple tasks, tap Bulk Delete | All selected tasks removed |
| 5.9 | Tap "Delete all done" | All completed tasks removed at once |

---

## 6. Task Details (Categories, Priority, Notes)

| # | Action | Expected Result |
|---|--------|----------------|
| 6.1 | Create task with category "Health" | Category label shown on task card |
| 6.2 | Create task with priority "High" | Red/orange indicator shown |
| 6.3 | Create task with priority "Low" | Green indicator shown |
| 6.4 | Add a note to a task | Note visible on task card or detail view |
| 6.5 | Edit category after creation | Updated immediately in list |

---

## 7. Notifications

| # | Action | Expected Result |
|---|--------|----------------|
| 7.1 | Create task 2 min from now, 1 min reminder | Notification fires at T-1 min with task title |
| 7.2 | Wait for event time | Alarm notification fires at exact event time |
| 7.3 | Long-press notification on Android | "Done" and "Postpone" action buttons visible |
| 7.4 | Tap "Done" on notification | Task marked done in app |
| 7.5 | Tap "Postpone" on notification | New random time generated, task rescheduled |
| 7.6 | Delete task while notification pending | Notification does not fire |
| 7.7 | Multiple reminders (30+10+5 min) | Three separate reminder notifications fire at correct times |

---

## 8. Recurring Tasks

| # | Action | Expected Result |
|---|--------|----------------|
| 8.1 | Create daily recurring task | Task listed with recurrence indicator |
| 8.2 | Wait for next day | New random time generated, new notifications scheduled |
| 8.3 | Mark recurring task done | Only today's instance marked done, tomorrow re-queued |
| 8.4 | Delete recurring task | All future instances cancelled |

---

## 9. Haptic Feedback

| # | Action | Expected Result |
|---|--------|----------------|
| 9.1 | Tap Generate | Subtle haptic pulse felt |
| 9.2 | Tap Copy | Haptic confirmation felt |
| 9.3 | Swipe to delete a task | Haptic on delete |
| 9.4 | Save a new task | Haptic on success |

---

## 10. Settings Screen

| # | Action | Expected Result |
|---|--------|----------------|
| 10.1 | Open Settings | Shows: theme, time format, default reminder, sound |
| 10.2 | Change theme light → dark | Immediately applies app-wide |
| 10.3 | Change default reminder to 20 min | New tasks default to 20 min |
| 10.4 | Change time format | Applies everywhere (tasks list, history, result) |
| 10.5 | Restart app | All settings persist |

---

## 11. Share & Export

| # | Action | Expected Result |
|---|--------|----------------|
| 11.1 | Tap Share on a task | Native share sheet with time + title |
| 11.2 | Share to Notes app | Pasted correctly formatted |
| 11.3 | Tap Export | JSON file saved to Files / Downloads |
| 11.4 | Open exported file | Valid JSON with all tasks |

---

## 12. Statistics

| # | Action | Expected Result |
|---|--------|----------------|
| 12.1 | Open Statistics screen | Shows total tasks, done count, completion % |
| 12.2 | After completing 3 tasks | Done count updates |
| 12.3 | View streaks | Shows days in a row with at least one task completed |
| 12.4 | Average reminder time | Calculated correctly from task history |

---

## 13. Multiple Times at Once

| # | Action | Expected Result |
|---|--------|----------------|
| 13.1 | Select "Generate 3" | Three distinct random times displayed |
| 13.2 | Each time has its own "Add to Calendar" button | Can save each independently |
| 13.3 | All times stay within the set range | Validated for all 3/5 results |

---

## 14. Edge Cases

| # | Scenario | Expected Result |
|---|----------|----------------|
| 14.1 | No internet connection | All features still work (fully offline) |
| 14.2 | Deny calendar permission | Graceful error, task not created |
| 14.3 | Deny notification permission | Event created, user informed no reminders will fire |
| 14.4 | Revoke permissions mid-session | Handled gracefully on next action |
| 14.5 | Install fresh (empty DB) | App works normally, no crashes |
| 14.6 | 100+ tasks in list | Scrolls smoothly, no lag |
| 14.7 | Very long task name (200 chars) | Truncated gracefully in list |
| 14.8 | Task at midnight (00:00:00) | Handled correctly, no off-by-one |
| 14.9 | Task at 23:59:59 | Handled correctly |
| 14.10 | Device timezone changes | Times displayed correctly after change |
