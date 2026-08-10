# RandomTime — Beta APK Deploy Plan (Phase 12)

App: `com.anonymous.randomtime` · versionCode `1` · versionName `1.0.0`
Branch: `feat/phase-12-overlay-alarms`

---

## Setup (one-time)

### Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Node.js | 18 LTS | Check: `node -v` |
| JDK | 17 | Required by Gradle; check: `java -version` |
| Android Studio | Ladybug / 2024.2+ | Installs the Android SDK and `adb` |
| adb | bundled with Android Studio | Add `platform-tools` to PATH |
| Git | any recent | — |

### Clone and install

```bash
git clone <repo-url> random-time
cd random-time
git checkout feat/phase-12-overlay-alarms
npm install
```

### Accept Android SDK licences

```bash
# Windows (run as Administrator if needed)
%LOCALAPPDATA%\Android\Sdk\cmdline-tools\latest\bin\sdkmanager --licenses

# macOS / Linux
~/Library/Android/sdk/cmdline-tools/latest/bin/sdkmanager --licenses
```

Confirm every prompt with `y`.

---

## Build — Debug APK (personal testing, no signing needed)

The debug build uses Android Studio's built-in debug keystore — no keystore
setup is required.

### Build

```bash
# macOS / Linux
cd android && ./gradlew assembleDebug

# Windows (PowerShell or cmd)
cd android
.\gradlew.bat assembleDebug
```

Gradle downloads dependencies on first run; expect 5–10 min initially.

Output APK:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

### Install via USB (adb)

1. Enable **Developer options** on the device (Settings > About phone > tap
   Build number 7 times).
2. Enable **USB debugging** (Settings > Developer options > USB debugging).
3. Connect phone via USB and accept the RSA key prompt on the device.

```bash
# From the repo root
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

`-r` reinstalls over an existing version without losing data.

### Install via file transfer (no USB debugging required)

1. Copy `app-debug.apk` to the phone (USB mass storage, Google Drive, email,
   etc.).
2. On the device, open the Files app, navigate to the APK, and tap it.
3. When prompted, enable **Install unknown apps** for the Files app (Settings >
   Apps > Files > Install unknown apps > Allow).
4. Tap **Install**.

---

## Build — Release APK (shareable with others, signed)

### 1. Generate a keystore

```bash
keytool -genkeypair -v \
  -keystore random-time-release.jks \
  -alias random-time-key \
  -keyalg RSA -keysize 2048 \
  -validity 10000
```

Store this file outside the repo and keep the passwords safe — losing it means
you cannot update the app on devices that have it installed.

### 2. Configure signing in `android/app/build.gradle`

Add a `release` signing config referencing the keystore:

```groovy
signingConfigs {
    release {
        storeFile     file('/path/to/random-time-release.jks')
        storePassword 'your-store-password'
        keyAlias      'random-time-key'
        keyPassword   'your-key-password'
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        // ... existing minify / proguard lines
    }
}
```

Prefer environment variables or `gradle.properties` (gitignored) over
hardcoding credentials in `build.gradle`.

### 3. Build

```bash
# macOS / Linux
cd android && ./gradlew assembleRelease

# Windows
cd android && .\gradlew.bat assembleRelease
```

Output APK:

```
android/app/build/outputs/apk/release/app-release.apk
```

Install with:

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

---

## EAS Build (cloud build — no local Android tooling needed)

Use this path if you do not have Android Studio installed locally or want a
reproducible build environment.

### 1. Install and authenticate

```bash
npm install -g eas-cli
eas login          # log in with your Expo account
```

### 2. Build the preview APK

```bash
eas build --platform android --profile preview
```

`eas.json` already defines the `preview` profile with `buildType: "apk"` and
`distribution: "internal"`. The build runs on Expo's servers; estimated time is
5–15 min.

### 3. Download and install

When the build completes, the Expo dashboard
(`expo.dev/accounts/<your-account>/projects/random-time/builds`) shows a
**Download** link and a QR code. Either:

- Scan the QR code on the device to download and install directly, or
- Download the APK to a PC and sideload via `adb install -r <apk>`.

---

## Post-install setup on device

Perform these steps after installing any build (debug or release).

### Grant overlay permission

Required for the Phase 12 floating alarm card.

- **In-app prompt**: launch RandomTime; if the "Enable Full-Screen Alarms" card
  appears on the main screen, tap **Enable** — the system Settings page for
  RandomTime opens automatically.
- **Manual path**: Settings > Apps > RandomTime > Display over other apps >
  Allow.

### Grant notification permission (Android 13+)

- The app requests this on first launch via `expo-notifications`.
- Manual path: Settings > Apps > RandomTime > Notifications > Allow.

### Disable battery optimisation (recommended for reliable alarms)

Android's Doze mode and OEM battery savers can delay or prevent AlarmManager
alarms on some devices (especially Xiaomi MIUI, OPPO ColorOS, OnePlus).

- Settings > Battery > Battery optimisation > All apps > RandomTime >
  Don't optimise.

On Samsung devices the path is: Settings > Battery and device care > Battery >
Background usage limits > Never sleeping apps > Add RandomTime.

---

## Rollback

Uninstall the current build:

```bash
adb uninstall com.anonymous.randomtime
```

Reinstall the previous APK:

```bash
adb install -r path/to/previous-app-debug.apk
```

---

## Play Store (future — not required for beta)

Before submitting to the Play Store, two manual steps are required in the Play
Console:

1. **`FOREGROUND_SERVICE_SPECIAL_USE` declaration form** — Google requires a
   written explanation of why `specialUse` is necessary. The answer for this app:
   "Foreground service delivers an overlay alarm card for task reminders while
   the user is actively using the phone." The property
   `android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE=alarms_and_reminders` is
   already declared in `AndroidManifest.xml`.

2. **Exact alarm use-case disclosure** — The manifest declares both
   `SCHEDULE_EXACT_ALARM` (API ≤ 32) and `USE_EXACT_ALARM` (API 33+). The Play
   Store listing description must explain the alarm/reminder use case. Evaluate
   at publish time whether targeting API 33+ and relying solely on
   `USE_EXACT_ALARM` (pre-granted for alarm apps) is preferable to keeping the
   dual-permission approach.
