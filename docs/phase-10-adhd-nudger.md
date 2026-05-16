# Phase 10 — ADHD Nudger Pivot (Sketch)

**Status:** Proposed
**Date:** 2026-04-24
**Depends on:** Phase 7 finished (weighted engine + bias toggles landed), Phase 8 partial (conflict detection is the key unlock)

---

## 1. Context — Why Repivot

Through Phase 9 the app has been positioned as a *generic* randomized task scheduler. The feature set (weighted random engine, excluded blocks, multi-reminders, done/postpone from tray, streaks, categories, priorities) is already disproportionately valuable to one audience: people with ADHD or executive-function challenges who struggle with the *when* of unpinned tasks.

The pivot is not a rewrite. It is a **re-framing of positioning, onboarding, and which features get promoted to the primary surface**. Code-wise it's additive. Brand-wise it's a sharper wedge.

**Core thesis:** The hardest part of an unpinned task for an ADHD brain is deciding when to do it. Offload that to a system that (a) picks a sensible moment, (b) tolerates re-rolls without shame, and (c) delivers dopamine on completion.

## 2. User

**Primary:** adults with ADHD diagnosis or self-identified executive-function struggles who already use task apps and find them punishing.
**Secondary:** anyone with decision fatigue around unpinned tasks (caregivers, remote workers, students).

Key design constraints the primary audience imposes:

| Need | Implication |
|---|---|
| Low-friction capture | One-tap voice or text. No required fields. |
| Forgiveness | Missing a nudge must not nuke a streak or feel like failure. |
| Time blindness support | Visible countdown / "when is the next thing" always one glance away. |
| Novelty / dopamine | Variable rewards, celebratory feedback, not grey checkboxes. |
| Low category overhead | Category/priority kept but never required, never first. |
| Re-roll over snooze | "Not now, re-pick" is cheaper than "snooze 10 min" — it respects that the user doesn't know *when* is better either. |

## 3. Decision — What Phase 10 Ships

### 3a. Promote to primary surface

- **Quick Capture FAB.** One floating button on Home. Tap → text input with "and I'll pick a time" placeholder. Long-press → voice capture (`expo-speech` / `expo-av`). No title-required, no date-required, no category. Picks today within user's active window.
- **Next Nudge widget.** Persistent card at top of Home: *"Next: 'call dentist' in 47 min"* with a large countdown ring. Directly addresses time blindness.
- **Re-roll from notification.** Alongside existing Done / Postpone actions, add "Re-roll" — re-runs `generateWeightedRandom` with the current bias config over the remaining day window and reschedules. Cheaper UX than user-picked snooze.

### 3b. New features

- **Surprise Me (task roulette).** "Pick N tasks from my backlog and scatter them across today." One tap. Uses weighted engine + excluded blocks for timing; uses simple random sampling over pending tasks. Visible backlog size must be kept small — prompt user to archive anything older than 30 days.
- **Energy check-in (optional, once a day).** On first open of the day, a dismissable card: "Low / Medium / High energy today?" — scales `N` in Surprise Me and reduces alarm intensity at Low.
- **Gentle pre-nudge tier.** 5 min before alarm, a silent heads-up notification (Android `IMPORTANCE_DEFAULT`, iOS non-critical). Gives a warm-up so the alarm isn't a jump-scare. Toggleable in Settings.
- **Streaks that heal.** Current streak logic is brittle (miss a day, lose it). New rule: one-miss grace per week. Surface "streak saved" animation on use-grace day. Behaviourally grounded; retention-positive.
- **Celebration micro-animations.** On task done: confetti / particle burst scaled to streak length. Haptic pattern, not single pulse.
- **Hyperfocus exit nudge (opt-in).** If the phone has been locked or the app unopened for > N hours during the user's active window, a soft reminder fires. Uses `BackgroundFetch`; must be clearly opt-in in Settings.

### 3c. Demote / keep but move

- **Categories & priorities.** Kept in DB, removed from the default Add flow. Surface only in an Edit sheet and as a filter chip row (collapsed by default). Reduces capture friction.
- **Manual date picker in quick capture.** Remove. Default = today inside active window. Edit sheet retains full control for the minority who want it.
- **Sort / filter controls.** Collapse into a single "View" menu. Search stays top-level.

### 3d. Onboarding rewrite

- Three-screen walkthrough (replaces Phase 9 onboarding stub):
  1. "Tell me something you've been meaning to do" → text field. Capture as first task.
  2. "I'll pick a good moment." → show the picked time with the biases explained in plain English: *"Between 9 and 5, not during lunch, not while you're asleep."*
  3. "If the moment's wrong, we re-roll. No points lost." → show the Re-roll action.

## 4. Options Considered

### Option A: Full rewrite as dedicated ADHD app ("FocusRoll" brand)

| Dimension | Assessment |
|---|---|
| Time to ship | 8–12 weeks |
| Risk | High — throws away validated code, two parallel brands |
| Upside | Clean positioning, App Store copy can be explicit |

**Pros:** Maximum clarity of pitch. Different review pool. Could price higher.
**Cons:** Wastes Phase 1–9 work. Two things to maintain. Nothing in the code actually forces a rewrite.

### Option B: In-place re-framing (this Phase 10)

| Dimension | Assessment |
|---|---|
| Time to ship | 3–4 weeks |
| Risk | Low-med — mostly additive, some UI reshuffling |
| Upside | Preserves all Phase 1–9 work, one codebase |

**Pros:** Cheap. Reversible. Store metadata can be tuned without code changes.
**Cons:** Generic name "RandomTime" undersells it — probably rename at store level (e.g., "Roll" or "Nudge") even if the repo name stays.

### Option C: Stay generic, add ADHD features as an optional "mode"

| Dimension | Assessment |
|---|---|
| Time to ship | 2 weeks |
| Risk | Low |
| Upside | Optionality preserved |

**Pros:** No positioning risk.
**Cons:** Mode toggles dilute the UX for both audiences. ADHD design choices (quick capture, re-roll, forgiving streaks) are strictly better defaults for everyone — putting them behind a switch hides them from the users who'd benefit most.

## 5. Trade-off Analysis

Option B is the right call. Option A's brand benefit isn't worth the rewrite when store listing copy + a light rename achieves 80% of it. Option C's reversibility is a false economy — the design shifts (collapse categories, quick capture, re-roll) are defensible improvements on their own, not ADHD-specific compromises.

The main trade-off inside Option B: **how much of the current "task management" surface to demote**. Aggressive demotion (no categories in quick-add, default-to-today) will annoy a small number of current power users. This is the right trade — the power-user path is an Edit sheet away, and the friction cost of the old default is borne by every new user on every capture.

## 6. Consequences

**Becomes easier**
- Store listing can target a named audience with specific language ("for ADHD brains", "time-blindness-friendly").
- Feature prioritization in Phase 11+ has a clear yardstick: "does this reduce capture friction or increase forgiveness?"
- Retention metric becomes crisper (7-day active + re-roll usage ratio).

**Becomes harder**
- Every new feature must pass the "does this add friction for a first-time user with ADHD?" check. Some good ideas will be rejected.
- Engineering the Quick Capture FAB correctly (voice permission handling on iOS, on-device speech recognition fallback) is non-trivial.
- Gamification has to be tasteful — reward-sensitive users will burn out fast on crude streak pressure, which is why "streaks that heal" matters.

**To revisit**
- App rename at store level. Do we keep `random-time` as the repo and choose a different store name, or unify?
- Analytics. We have none. At minimum, measure: capture-to-completion conversion, re-roll rate, median time-to-capture.

## 7. Success Metrics (Phase 10 exit criteria)

- Quick Capture median interaction time < 5 seconds from tap to saved task.
- At least one Re-roll path exercised in every acceptance test.
- Onboarding completes with first task captured, first nudge scheduled, first re-roll demonstrated — all three in under 90 seconds.
- 48-test suite still green; new feature tests bring total to ~100.

## 8. Action Items

1. [ ] Build `components/QuickCaptureFab.tsx` + `hooks/useQuickCapture.ts` — text-first, voice-optional.
2. [ ] Build `components/NextNudgeCard.tsx` — countdown ring, tap-to-view.
3. [ ] Extend `notificationService.ts` with Re-roll action handler; wire into Android channels.
4. [ ] Add gentle pre-nudge tier — new Android channel `pre_reminders` @ `IMPORTANCE_DEFAULT`, schedule 5 min before existing reminder.
5. [ ] Implement `surpriseMe(count: number)` in `App.tsx` or a new `scheduler.ts` — picks N pending tasks, scatters via weighted engine.
6. [ ] Add `energy_level` setting (`low` | `medium` | `high`, resets daily).
7. [ ] Rewrite streak logic in stats to allow one grace day per rolling 7-day window.
8. [ ] Move category + priority out of Add flow into Edit sheet.
9. [ ] Rewrite onboarding (3 screens, first task captured inline).
10. [ ] Store metadata pass — `docs/store-metadata.md` with ADHD-positioned copy.
11. [ ] Celebration animation on task-done — scale with streak length.
12. [ ] (Stretch) Hyperfocus exit nudge behind Settings toggle.

## 9. Deferred / Out of Scope

- Full voice-driven UI (beyond capture). Phase 12+.
- Medication reminders — different regulatory posture, different UX.
- Social / body-doubling features — worth a future phase but orthogonal.
- Cross-device sync — needs backend; Phase 11+ at earliest.
- Smart-watch companion — complicates EAS config; revisit post-launch.

## 10. Open Questions

- Rename at store level? (needs user decision)
- Voice capture: on-device (Apple Speech / Android SpeechRecognizer via a config plugin) or cloud? On-device is better for privacy but harder to ship on Expo.
- Analytics vendor (if any) — PostHog self-hosted vs. none at all.
