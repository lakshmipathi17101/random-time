# RandomTime — Deploy Runbook

App: `com.anonymous.randomtime` · Repo: `E:\E-Will\random-time`

This file is the `deployer` agent's authoritative runbook. Every section is
executable by an agent without human interaction. Steps that require a physical
device are clearly labelled **[MANUAL]** and must be skipped in unattended runs.

---

## Environment variables

The following must be set before any `gradle` or `adb` invocation. The
`deployer` agent must export these at the start of every session:

```bash
export JAVA_HOME="C:/Program Files/Microsoft/jdk-17.0.20.8-hotspot"
export ANDROID_HOME="C:/Users/kvlpv/AppData/Local/Android/Sdk"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH"
```

Verify before proceeding:

```bash
java -version          # must report 17.x
adb version            # must report a version (skip if no device needed)
node --version         # must report 18+
```

---

## Setup (once per clean worktree or fresh clone)

```bash
# 1. Install JS dependencies
npm install

# 2. Verify TypeScript compiles clean
npx tsc --noEmit

# 3. Run unit test suite (confirms Jest + mocks are wired correctly)
npx jest --passWithNoTests --forceExit
```

Accept if all three exit 0. If `npx tsc --noEmit` fails, stop and file a
bug in beads before proceeding.

---

## Smoke test

Run after every code change to confirm the build baseline is sane before a
full Gradle build:

```bash
npx tsc --noEmit && npx jest --passWithNoTests --forceExit
```

Exit 0 = smoke passed. Exit non-zero = stop; do not proceed to Build.

---

## Deploy

Standard deploy sequence for an unattended agent run (no physical device required):

```bash
# 1. Install JS dependencies
npm install

# 2. TypeScript check
npx tsc --noEmit

# 3. Unit test suite
npx jest --passWithNoTests --forceExit

# 4. Build release APK (standalone, no Metro required)
cd android && ./gradlew assembleRelease --no-daemon && cd ..

# 5. Verify output
ls -lh android/app/build/outputs/apk/release/app-release.apk
```

Accept if all five steps exit 0 and the APK exists. The release APK is the
deliverable — it embeds the JS bundle and works standalone on a device.
Install on device is **[MANUAL]** — see the "Install on device" section below.

---

## Build — Debug APK (arm64-v8a only, ~28 MB)

```bash
cd android
./gradlew assembleDebug --no-daemon
cd ..
```

On Windows use `gradlew.bat` if running under cmd; under Git Bash or the
Bash tool, `./gradlew` works directly.

Output path:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Verify output exists and is non-trivial (> 10 MB):

```bash
ls -lh android/app/build/outputs/apk/debug/app-debug.apk
```

Expected size: 38–48 MB (arm64-v8a only; x86/armeabi-v7a stripped by
`defaultConfig { ndk { abiFilters "arm64-v8a" } }` and
`reactNativeArchitectures=arm64-v8a` in `gradle.properties`).
Debug builds carry uncompressed JS bundles and debug symbols, so they are larger
than release builds.

---

## Install on device [MANUAL — requires USB-connected Android device]

```bash
# Uninstall first to avoid signing-key conflicts on re-install
adb uninstall com.anonymous.randomtime 2>/dev/null || true
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

Post-install grants required (do once after fresh install):

```bash
# Grant SYSTEM_ALERT_WINDOW (overlay) — Android 11+ requires manual toggle in Settings
# No adb shell command can pre-grant this permission; user must navigate:
#   Settings > Apps > RandomTime > Display over other apps > Allow
echo "[MANUAL] Grant overlay permission in device Settings"

# Grant POST_NOTIFICATIONS (Android 13+) — can be pre-granted via adb on API 33+
adb shell pm grant com.anonymous.randomtime android.permission.POST_NOTIFICATIONS 2>/dev/null || true

# Disable battery optimisation for reliable AlarmManager
adb shell dumpsys deviceidle whitelist +com.anonymous.randomtime 2>/dev/null || true
```

---

## Reset (between test cycles — no fresh install needed)

Clears persistent app storage so each test cycle starts from a known state:

```bash
# Clear app data (resets SQLite DB, shared prefs, cached permissions)
adb shell pm clear com.anonymous.randomtime

# Re-grant POST_NOTIFICATIONS after clear
adb shell pm grant com.anonymous.randomtime android.permission.POST_NOTIFICATIONS 2>/dev/null || true

# Note: SYSTEM_ALERT_WINDOW is also cleared — must be re-granted manually
echo "[MANUAL] Re-grant overlay permission after data clear"

# Clean Gradle build cache (if code changed between cycles)
cd android && ./gradlew clean --no-daemon && cd ..
```

---

## Teardown (after all test cycles complete)

```bash
# Uninstall the test build from device (leaves a clean device state)
adb uninstall com.anonymous.randomtime 2>/dev/null || true

# Clear Gradle daemon state
cd android && ./gradlew --stop 2>/dev/null; cd ..
```

No server or background process to terminate — this app has no server component.

---

## Rollback

```bash
# Reinstall a known-good APK
adb uninstall com.anonymous.randomtime 2>/dev/null || true
adb install path/to/previous-app-debug.apk
```

To roll back code, checkout the previous commit on the branch and rebuild:

```bash
git checkout <previous-sha> -- .
npm install
cd android && ./gradlew assembleDebug --no-daemon && cd ..
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

---

## Release APK (not required for testing; future Play Store submission)

```bash
# Requires signing keystore — see docs/phase-12-overlay-alarms.md for setup
cd android && ./gradlew assembleRelease --no-daemon && cd ..
# Output: android/app/build/outputs/apk/release/app-release.apk
```

Before Play Store submission, two manual steps are required:
1. Complete the `FOREGROUND_SERVICE_SPECIAL_USE` declaration form in Play Console.
2. Review exact-alarm permission disclosure in the listing description.
