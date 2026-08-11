# RandomTime — Integration Test Playbook

App: `com.anonymous.randomtime` · Repo: `E:\E-Will\random-time`

This file is the `integ-test-runner` agent's authoritative playbook. Sections are
structured for automated execution. Steps that require a physical device are
labelled **[MANUAL]**; the agent records them as informational, not pass/fail.

---

## Environment

Same as `deploy.md`. The `integ-test-runner` must source the same env block:

```bash
export JAVA_HOME="C:/Program Files/Microsoft/jdk-17.0.20.8-hotspot"
export ANDROID_HOME="C:/Users/kvlpv/AppData/Local/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

---

## Setup

```bash
# 1. Install JS dependencies (idempotent)
npm install

# 2. Confirm baseline: TypeScript clean + all tests green
npx tsc --noEmit
npx jest --passWithNoTests --forceExit

# 3. Confirm APK exists (built by deployer before integ-test-runner runs)
ls android/app/build/outputs/apk/debug/app-debug.apk
```

If any of the above fail, stop and report — do not proceed to feature tests.

---

## Reset (between test cycles)

```bash
# Re-run jest to confirm no regressions from in-cycle changes
npx jest --passWithNoTests --forceExit

# If a device is connected: clear app data
adb shell pm clear com.anonymous.randomtime 2>/dev/null || true
```

---

## Teardown

```bash
# Uninstall from device (if connected)
adb uninstall com.anonymous.randomtime 2>/dev/null || true

echo "Teardown complete."
```

---

## Feature tests

Tests are organised by feature area. Each block states the **automated** check
the `integ-test-runner` must run and the **manual** verification steps where
device interaction is required. The agent runs all automated steps, logs the
results, and files a beads bug for each automated failure. Manual steps are
noted as "manual required" in the bug.

---

### F1 — TypeScript build (static correctness)

**Automated**

```bash
npx tsc --noEmit
```

Pass: exit 0, zero errors. Fail: any `error TS` line in output.

---

### F2 — Full Jest suite (unit + DB layer)

**Automated**

```bash
npx jest --passWithNoTests --forceExit --verbose 2>&1 | tail -30
```

Pass: `Tests: <N> passed, <N> total` and exit 0. Fail: any `FAIL` or
non-zero exit.

Expected baseline as of Phase 13: **168 tests passing across 9 suites.**
File a bug if total drops below 168 or any suite fails.

---

### F3 — DB layer: task_completions

**Automated** (covered by Jest suite `__tests__/progressDashboard.test.ts`)

```bash
npx jest --testPathPattern="progressDashboard" --forceExit --verbose
```

Pass: all 6 describe-block tests green. Checks:
- `upsertCompletion` inserts and is queryable via `getCompletions`
- Range boundary: dates outside [start, end] are excluded
- Upsert idempotency: same task+date → 1 row, updated value
- `purgeOldCompletions` removes >365-day-old rows
- Inverted date range returns empty array

---

### F4 — Overlay alarm bridge (Phase 12)

**Automated** (covered by Jest suite `__tests__/overlayAlarmBridge.test.ts`)

```bash
npx jest --testPathPattern="overlayAlarmBridge" --forceExit --verbose
```

Pass: all 12 cases green. Checks:
- Module present path: scheduleOverlayAlarm, cancelOverlayAlarm, fireOverlayAlarmNow, dismissOverlayAlarm callable without throw
- Module absent path: all functions fall back to no-op + console.warn
- Event subscription lifecycle: subscribe returns an unsubscribe function; calling it does not throw

**[MANUAL — device required]** After automated tests pass, verify on a real device:

1. Build and install the debug APK.
2. Set a task alarm 1–2 min in the future.
3. Navigate to another app.
4. Confirm: floating overlay card appears with Done / Postpone / Re-roll.
5. Tap each button and confirm overlay dismisses and task state updates.

Record result as PASS / FAIL / SKIP in the beads issue notes.

---

### F5 — Progress Dashboard (Phase 13)

**Automated** (covered by Jest suite `__tests__/progressDashboard.test.ts` — same as F3)

No additional automated tests beyond F3.

**[MANUAL — device required]** Verify the UI on a real device:

1. Launch app, tap **Progress** tab.
2. Confirm grid loads: rows = task names, columns = day/date headers, cells = tappable circles.
3. Tap a cell — circle should fill (done). Tap again — circle empties.
4. Switch range selector: 7d / 30d / 90d / 1y — grid re-renders with correct column count.
5. At 90d / 1y: columns collapse to W1, W2, … week labels.
6. Switch to **Chart** view — vertical bars and horizontal progress bars render without crash.
7. Row tail shows correct running total count.

Record result as PASS / FAIL / SKIP in the beads issue notes.

---

### F6 — APK size regression guard (Phase 13)

**Automated**

```bash
APK=android/app/build/outputs/apk/debug/app-debug.apk
SIZE=$(wc -c < "$APK")
echo "APK size: $((SIZE / 1024 / 1024)) MB"
# Fail if APK is larger than 60 MB (regression guard)
if [ "$SIZE" -gt 62914560 ]; then
  echo "FAIL: APK exceeds 60 MB — ABI filter may not be active (check defaultConfig.ndk and reactNativeArchitectures in gradle.properties)"
  exit 1
fi
echo "PASS: APK within size budget"
```

Expected: 38–48 MB (arm64-v8a only debug build). A size above 60 MB indicates
`defaultConfig { ndk { abiFilters "arm64-v8a" } }` or
`reactNativeArchitectures=arm64-v8a` in `gradle.properties` is not being applied.
Also verify: `unzip -l <apk> | grep lib/ | cut -d/ -f2 | sort -u` should print only `arm64-v8a`.

---

### F7 — Core regression: existing features

**Automated**

```bash
npx jest --testPathPattern="notificationService|overlayAlarmBridge|progressDashboard" --forceExit --verbose
```

**[MANUAL — device required]**

| Sub-test | Steps | Expected |
|----------|-------|----------|
| T-RAND — Weighted random time | Tap the random-time generator 10 times | Times generated without crash; bias settings respected |
| T-THEME — Dark/light toggle | Toggle theme in settings | UI switches without crash or layout issues |
| T-PERSIST — Task data persistence | Add task with notes + priority; force-close; relaunch | Task reappears with all fields intact |
| T-HAPTIC — Celebration haptic | Complete tasks until a streak fires | Device vibrates on streak milestone |
| T-NOTIF — Notification permission gate | Fresh install, deny overlay permission | "Enable Full-Screen Alarms" card shown; "Not now" dismissal persists across restarts |

---

## Beads bug template (for failures)

When the `integ-test-runner` files a bug for a failed automated check, use:

```
bd create --title="integ: <feature> — <short description>" \
          --type=bug \
          --priority=1 \
          --description="Failure in <feature> during integration test cycle. \
                         Command: <command>. \
                         Output: <tail of output>. \
                         Expected: <what should have happened>." \
          --acceptance="<feature> automated test exits 0 with N tests passing."
```

---

## Known limitations

- **Device tests are manual.** No adb-based UI automation framework is wired;
  F4, F5, F7 device steps require a human tester. The integ-test-runner marks
  these as "manual required" rather than FAIL.

- **Overlay does not wake the screen from sleep.** `TYPE_APPLICATION_OVERLAY`
  only fires while the device is already awake and unlocked — by design.

- **OEM battery optimisation** (Xiaomi MIUI, OPPO ColorOS, OnePlus) may kill
  AlarmManager alarms. Disable battery optimisation for RandomTime before
  device testing: Settings > Battery > RandomTime > Don't optimise.

- **`SCHEDULE_EXACT_ALARM` user approval on Android 12 (API 31–32).** If
  revoked, overlay alarm falls back to `setExact` under Doze. The
  expo-notifications alarm path is unaffected.
