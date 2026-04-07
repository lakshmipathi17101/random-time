# RandomTime — Deployment Checklist

## Pre-Build Requirements

### 1. EAS Account & Project Setup
- [ ] Install EAS CLI: `npm install -g eas-cli`
- [ ] Log in: `eas login` (use Apple ID / Expo account)
- [ ] Create EAS project: `eas init` — copy the generated `projectId` into `app.json` > `extra.eas.projectId`
- [ ] Replace `REPLACE_WITH_EAS_PROJECT_ID` in `app.json`

### 2. Asset Files (REQUIRED — currently missing)
The following assets are referenced in `app.json` but must be created before building:

| File | Dimensions | Notes |
|------|-----------|-------|
| `assets/icon.png` | 1024×1024 px | iOS App Icon — no rounded corners, no transparency |
| `assets/adaptive-icon.png` | 1024×1024 px | Android Adaptive Icon foreground — safe zone: central 66% |
| `assets/splash-icon.png` | 1242×2688 px (or 1284×2778) | Splash screen — logo centered on `#0f0f1a` background |
| `assets/notification-icon.png` | 96×96 px | Android notification icon — white on transparent |
| `assets/favicon.png` | 64×64 px | Web favicon |

**Tools:** Use [Expo icon generator](https://www.appicon.co/) or Figma. Place all files in `./assets/`.

### 3. iOS Certificates (Apple Developer — $99/yr)
- [ ] Enroll in Apple Developer Program: https://developer.apple.com/programs/
- [ ] Replace `REPLACE_WITH_APPLE_TEAM_ID` in `eas.json` with your 10-character Team ID
- [ ] Create App Store Connect app record at https://appstoreconnect.apple.com
- [ ] Replace `REPLACE_WITH_APP_STORE_CONNECT_APP_ID` in `eas.json` with the numeric App ID
- [ ] EAS will manage provisioning profiles and certificates automatically

### 4. Android Play Console (Google — $25 one-time)
- [ ] Create account at https://play.google.com/console
- [ ] Create new app: "RandomTime"
- [ ] Create a service account key (JSON) for automated submissions
- [ ] Save the JSON file as `google-service-account.json` in project root (add to `.gitignore`)
- [ ] Grant the service account "Release Manager" permissions in Play Console

### 5. Privacy Policy
- [ ] Host a privacy policy at the URL in `SettingsPanel.tsx`:
  `https://lakshmipathi17101.github.io/random-time/privacy`
- [ ] Minimum required content: what data is collected, how it's used, contact email
- [ ] Use GitHub Pages or a simple static site

---

## Building

### Development Build (for physical device testing)
```bash
eas build --profile development --platform ios
eas build --profile development --platform android
```

### Preview Build (APK for Android sideloading)
```bash
eas build --profile preview --platform android
```

### Production Build
```bash
eas build --profile production --platform ios
eas build --profile production --platform android
```

---

## Testing Before Submission

- [ ] Test on physical iOS device (iPhone, not just simulator)
- [ ] Test on physical Android device (API 33+)
- [ ] Test notification permissions flow (deny → re-request)
- [ ] Test calendar permissions flow (deny → re-request)
- [ ] Test "Done" and "Postpone" actions from notification tray
- [ ] Test with min = max time range (should generate a single time)
- [ ] Test ×3 and ×5 generation
- [ ] Test task creation with future date
- [ ] Test bulk delete
- [ ] Verify app launches cleanly on first install (no crash, DB migration runs)

---

## App Store Submission (iOS)

### App Store Connect Setup
- [ ] Set app category: **Productivity**
- [ ] Age rating: **4+**
- [ ] Add screenshots: required sizes are 6.7", 6.1", and iPad 12.9" (see store-metadata.md)
- [ ] Upload App Preview video (optional but recommended)
- [ ] Fill in all metadata from `store-metadata.md`
- [ ] Enter Privacy Policy URL
- [ ] Enable "Notifications" in App Privacy Data → Data types collected: **None** (we only store locally)

### Submit
```bash
eas submit --platform ios --profile production
```
Or upload manually from App Store Connect.

---

## Google Play Submission (Android)

### Play Console Setup
- [ ] Set main category: **Productivity**
- [ ] Upload all required graphics: icon (512×512), feature graphic (1024×500), screenshots
- [ ] Fill in store listing from `store-metadata.md`
- [ ] Add Privacy Policy URL
- [ ] Complete "Data safety" section → No data collected or shared

### Submit (Internal Track First)
```bash
eas submit --platform android --profile production
```

### Promote to Production
- [ ] Promote from Internal → Production in Play Console after testing
- [ ] Set rollout to 10% initially, then 100%

---

## Post-Launch

- [ ] Monitor crash reports in Expo's dashboard or integrate Sentry
- [ ] Monitor App Store reviews and Play Store reviews
- [ ] Respond to user reviews within 24–48 hours
- [ ] Plan Phase 6–9 feature releases

---

## Version Bump Process (for future releases)

1. Bump `version` in `app.json` (e.g. `"1.0.1"`)
2. Bump `versionCode` in `app.json` > `android` (e.g. `2`) — must always increment
3. `buildNumber` is auto-incremented by EAS (`"autoIncrement": true` in `eas.json`)
4. Rebuild and resubmit
