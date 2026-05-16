# Phase 11 — App-Control Pivot (Design Sketch)

> *Status*: design only — not yet implemented. Decisions captured here are
> intended to be ratified before any code is written, because step 1 of this
> phase (`expo prebuild`) is effectively one-way.

## Context

The Phase 10 ADHD pivot delivered *polite* nudging — countdown cards, gentle
pre-nudges, scaled celebration haptics, Surprise Me task roulette. None of it
*enforces* anything. Users with ADHD often need a harder boundary: not "please
remember to stop scrolling" but "I literally cannot open Instagram for the next
45 minutes."

This phase adds the missing tier: foreground-app detection + block overlay +
usage stats, exposed to the existing React Native UI via a new Kotlin native
module.

## Constraints

- Two distribution targets: **Play Store** (policy-restricted) and **sideload /
  F-Droid** (policy-free).
- Existing JS investment (~2,400 lines App.tsx + utils + 119 tests) should be
  preserved, not rewritten.
- Phase 10 nudger features should keep working unchanged.
- Native code must be testable in isolation (JVM unit tests on the Kotlin
  side; mocked native module on the JS side).

## Decision — Approach

**Accessibility Service + overlay**, packaged as an opt-in capability behind a
**build flavor**.

- `playStoreLite` flavor — UsageStatsManager only, no `BIND_ACCESSIBILITY_SERVICE`
  permission declared. Read foreground app, time-in-app, fire local
  notifications when a soft limit is exceeded. **Cannot block.** Survives Play
  Store review under the existing "digital wellbeing" framing.
- `sideloadFull` flavor — adds the Accessibility Service, the
  `SYSTEM_ALERT_WINDOW` overlay permission, and the actual block UI. Distributed
  via direct APK / F-Droid / GitHub Releases. Never submitted to Play Store.

This costs one Gradle product flavor and a couple of `BuildConfig.HAS_BLOCKER`
guards in JS. It pays for itself by avoiding a permanent Play Store
delisting risk.

## Decision — Stack

**Expo prebuild (bare workflow) + Kotlin native module.** Keep the JS layer.

- `npx expo prebuild` materialises the `android/` directory.
- Add `expo-build-properties` config plugin to manage Gradle props.
- New native module `AppControlModule.kt` exposes a small surface to JS:
  - `getInstalledApps(): App[]`
  - `getUsageStats(sinceMs): UsageRow[]`
  - `startFocusSession(blockedPackages, durationMin): SessionHandle`
  - `endFocusSession(handle): void`
  - `requestAccessibilityPermission(): void` (deep-link to Settings)
  - `requestUsageStatsPermission(): void` (deep-link to Settings)
  - `requestOverlayPermission(): void` (deep-link to Settings)
  - `getPermissionStatus(): { accessibility, usageStats, overlay }`
  - Event emitter: `onForegroundAppChanged({ packageName, timestamp })`,
    `onBlockedAppLaunched({ packageName })`

The Accessibility Service itself (`BlockerAccessibilityService.kt`) lives
alongside the module. It reads the current focus session from a small
`SharedPreferences` store (or Room DB) and inflates a full-screen overlay
when a blocked package becomes foreground.

## Architecture sketch

```
┌──────────────────────────────────────────────────────────────────┐
│                        React Native (JS)                         │
│   App.tsx → existing Phase 10 nudger                             │
│         ↓                                                        │
│   AppControlScreen.tsx (new)                                     │
│     • app picker (lists installed apps)                          │
│     • focus session config (duration, packages)                  │
│     • permission gating UI                                       │
│     • usage stats charts                                         │
│         ↓                                                        │
│   useAppControl() hook (new)                                     │
│         ↓ via NativeModules                                      │
└──────────────────────────────────────────────────────────────────┘
                              ↓ JSI bridge
┌──────────────────────────────────────────────────────────────────┐
│                        Kotlin (Android)                          │
│   AppControlModule (ReactContextBaseJavaModule)                  │
│     • PackageManager queries                                     │
│     • UsageStatsManager queries                                  │
│     • starts/stops FocusSession in SharedPreferences             │
│     • emits events to RN                                         │
│         ↑ writes session config                                  │
│   FocusSessionStore (SharedPreferences / Room)                   │
│         ↑ reads session config                                   │
│   BlockerAccessibilityService                                    │
│     • onAccessibilityEvent → check fg pkg vs blocked list        │
│     • if blocked → start BlockOverlayActivity (transparent)      │
│     • or → WindowManager.addView(blockerView, TYPE_APPLICATION_OVERLAY) │
│   BlockOverlayActivity / BlockerView                             │
│     • full-screen "you're in a focus session" UI                 │
│     • "request 30s emergency unlock" → calls back into RN        │
└──────────────────────────────────────────────────────────────────┘
```

## Options Considered

### A. Accessibility Service + overlay  ← **chosen**

- *Pros*: full control, well-trodden pattern (Forest, ScreenZen, Cold Turkey),
  works on stock Android, no root.
- *Cons*: Play Store policy hostility; users must grant a scary permission;
  Google may pull or reject the app under the "accessibility primary purpose"
  rule. Mitigated by the dual-flavor strategy.

### B. UsageStats only (observe, don't block)

- *Pros*: Play Store-safe; gentle; minimal native code.
- *Cons*: doesn't actually block. The user can still open the app — the best
  we can do is fire a notification. This is what most "ADHD" apps in the Play
  Store actually are, and it's exactly what the user said wasn't enough.
- *Where it lives*: the `playStoreLite` flavor. We build it anyway.

### C. Work Profile / Device Admin

- *Pros*: real system-level enforcement, Play Store-compatible.
- *Cons*: provisioning UX is brutal — user has to set up a managed profile,
  which factory-resets a portion of the device. Wrong tool for a personal
  productivity app. Better suited to MDM / parental-control products.

### D. VPN-based block

- *Pros*: lightweight; no accessibility permission; some Play Store apps use
  this.
- *Cons*: only blocks network access. Offline-capable apps (cached YouTube,
  games, downloaded TikTok feed, the system camera) are immune. Inadequate
  for the use case.

### E. Full Kotlin/Compose rewrite

- *Pros*: cleaner if app-control becomes the centerpiece.
- *Cons*: throws away ~2,400 lines of working JS, the entire Phase 10
  surface, and the 119 tests. The nudger and the blocker are independent
  enough that they don't need to share code paths — keeping JS for the
  former is fine.

## Permission UX

Three permissions, all granted via deep-link to Settings (no in-app prompt):

1. **`PACKAGE_USAGE_STATS`** (special permission). Required for foreground-app
   detection in the `playStoreLite` flavor and for usage stats in both. Open
   `Settings.ACTION_USAGE_ACCESS_SETTINGS`.
2. **`BIND_ACCESSIBILITY_SERVICE`** (sideload flavor only). Open
   `Settings.ACTION_ACCESSIBILITY_SETTINGS`.
3. **`SYSTEM_ALERT_WINDOW`** (sideload flavor only, for the blocker overlay).
   Open `Settings.ACTION_MANAGE_OVERLAY_PERMISSION`.

The UI walks the user through these in order, with a "Why this permission?"
disclosure for each. We do *not* nag — if the user denies, we degrade
gracefully (e.g. show usage stats but disable blocking).

## Data Model

New SQLite tables (additive to existing `tasks` / `settings`):

```sql
CREATE TABLE blocked_apps (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  package_name TEXT NOT NULL UNIQUE,
  app_label   TEXT NOT NULL,
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL
);

CREATE TABLE focus_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  start_ts    INTEGER NOT NULL,
  end_ts      INTEGER NOT NULL,   -- planned end
  ended_at    INTEGER,            -- actual end (NULL = still running)
  blocked_pkgs TEXT NOT NULL,     -- JSON array
  emergency_unlocks INTEGER NOT NULL DEFAULT 0,
  source      TEXT NOT NULL       -- 'manual' | 'task' | 'schedule'
);

CREATE TABLE usage_samples (
  package_name TEXT NOT NULL,
  date_key    TEXT NOT NULL,      -- 'YYYY-MM-DD'
  seconds     INTEGER NOT NULL,
  PRIMARY KEY (package_name, date_key)
);
```

Settings additions: `app_control_enabled`, `focus_session_default_minutes`,
`emergency_unlock_cooldown_seconds`, `usage_alert_threshold_minutes`.

## Phasing — incremental delivery

Each step is independently shippable and rolls back cleanly to the previous
state if abandoned.

### 11.0 — Prebuild + scaffold (≈1 hour)

- Commit Phase 7 + Phase 10 work as a clean restore point.
- Run `npx expo prebuild --platform android`.
- Verify the existing app still builds (`npx expo run:android`).
- Add Gradle product flavors (`playStoreLite`, `sideloadFull`).
- Commit the prebuild snapshot.

### 11.1 — Permission plumbing (≈2 hours)

- `AppControlModule.kt` skeleton with `getPermissionStatus()` and the three
  `requestX()` deep-links.
- JS `useAppControl()` hook + a Settings → "App Control" entry that surfaces
  the permission states.
- No actual blocking yet — just plumbing.

### 11.2 — Usage stats (Play Store flavor's full feature) (≈3 hours)

- `getUsageStats(sinceMs)` implementation against `UsageStatsManager`.
- App picker UI listing installed apps with time-today.
- Soft-limit notifications: "you've been in X for N minutes."
- Manual test on a physical device + sample-data unit tests.

### 11.3 — Accessibility Service + overlay (sideload flavor only) (≈4 hours)

- `BlockerAccessibilityService.kt` watching for window state changes.
- `FocusSessionStore` in SharedPreferences.
- `BlockerView` overlay with "you're in a focus session" + countdown.
- `startFocusSession`/`endFocusSession` JS API.
- Emergency unlock with cooldown.

### 11.4 — Wire into nudger (≈2 hours)

- Auto-start a focus session when Surprise Me fires a task.
- "Focus mode" toggle on the Next Nudge card.
- "Block these apps until [task] is done" option in AddEventModal.

### 11.5 — Polish + store prep (≈3 hours)

- Two-flavor build pipeline in `eas.json`.
- Sideload landing page / GitHub release scaffolding.
- Updated `store-metadata.md` carefully avoiding accessibility-flavored
  copy for the Play Store listing.

## Risks

- **Play Store rejection of sideloadFull**: never submit it. Discipline issue,
  not a technical one — but we should add a CI guard that fails the build if
  `sideloadFull` is being uploaded via `gh release` → `eas submit`.
- **Play Store rejection of playStoreLite for usage stats**: low. Many apps do
  this. Listing copy must be "digital wellbeing" not "block apps."
- **Accessibility Service performance**: `onAccessibilityEvent` fires *a lot*.
  Filter aggressively to `TYPE_WINDOW_STATE_CHANGED` and debounce duplicate
  events from the same package.
- **Overlay visibility on Android 12+**: `TYPE_APPLICATION_OVERLAY` works but
  user-grant of `SYSTEM_ALERT_WINDOW` is a separate flow we must guide them
  through.
- **The user can always disable our accessibility service** from Settings. We
  cannot prevent this and shouldn't try. The block is a commitment device,
  not a prison.

## Success metrics

- A focus session, once started, actually prevents the user from opening
  selected apps until it ends (or until they explicitly emergency-unlock).
- Battery drain from the accessibility service is negligible (< 1% / hour
  measured on a Pixel 6 over a 4-hour focus session).
- The Play Store flavor passes review on first submission.
- The existing Phase 10 nudger features all keep working unchanged after
  prebuild (no regressions in the 119-test suite).

## Open Questions

1. **Should focus sessions persist across reboot?** Argument for yes: bedtime
   focus mode. Argument for no: state-after-reboot is a UX surprise. Default:
   yes, with explicit "extend across reboot" toggle.
2. **Allowlist or blocklist as the default mental model?** Blocklist
   ("block these distracting apps") is easier to set up; allowlist ("only
   these apps are allowed during focus") is more powerful but harder to get
   right. Default to blocklist, add allowlist later.
3. **What's the "emergency unlock" UX?** 30s typed-confirmation? 10-pushup
   ARKit gimmick? Just a plain "I really need to" button with logged
   attempts? Default: 10-second hold-to-confirm + log every unlock for
   later reflection.
4. **Does iOS get any of this?** No. iOS's Screen Time API
   (`FamilyControls`) requires entitlements that don't ship to indie
   developers. iOS build stays managed-Expo and quietly omits the
   app-control surface.
