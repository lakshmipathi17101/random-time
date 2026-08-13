/**
 * Verification for the App.tsx badge refresh wiring (random-time-dj0.5).
 *
 * random-time-dj0.3 covers computeBadgeCount and the notificationService
 * setBadgeCount/clearBadge wrappers in isolation; nothing else verifies the
 * App.tsx wiring added by random-time-dj0.4 that actually keeps the launcher
 * badge in sync. This is a plain jest + fs source-assertion suite (no react
 * renderer — the repo has neither @testing-library/react-native nor
 * react-test-renderer, and none may be added here). Follows the convention
 * established by __tests__/onboardingGate.test.ts.
 *
 * SCOPE: verification only. Adds exactly this one test file; changes no
 * source, config, or native file.
 */

import * as fs from "fs";
import * as path from "path";

const appSrc = fs.readFileSync(path.join(__dirname, "../App.tsx"), "utf8");

/**
 * Extracts the body of `const refreshBadge = useCallback((...) => { ... }, []);`
 * Returns null if the callback cannot be found.
 */
function extractRefreshBadgeBody(app: string): string | null {
  const m = /const\s+refreshBadge\s*=\s*useCallback\(\s*\([^)]*\)\s*=>\s*\{([\s\S]*?)\},\s*\[\s*\]\s*\)/.exec(
    app
  );
  return m ? m[1] : null;
}

/**
 * Extracts the body + dependency array of the useEffect that calls
 * `refreshBadge(tasks)` — the task-change refresh effect.
 */
function extractTaskChangeEffect(
  app: string
): { body: string; deps: string } | null {
  const m = /useEffect\(\s*\(\)\s*=>\s*\{([\s\S]*?refreshBadge\(\s*tasks\s*\)[\s\S]*?)\},\s*\[([^\]]*)\]\s*\)/.exec(
    app
  );
  return m ? { body: m[1], deps: m[2] } : null;
}

interface WiringCheck {
  name: string;
  match: (app: string) => boolean;
  message: string;
}

// Keep every check in this one table — adding a new check is one entry.
const CHECKS: WiringCheck[] = [
  {
    name: "1. imports computeBadgeCount and setBadgeCount",
    match: (app) =>
      /import\s*\{[^}]*\bcomputeBadgeCount\b[^}]*\}\s*from\s*["']\.\/utils\/badge["']/.test(
        app
      ) &&
      /import\s*\{[^}]*\b(setBadgeCount|clearBadge)\b[^}]*\}\s*from\s*["']\.\/notificationService["']/.test(
        app
      ),
    message:
      "App.tsx must import computeBadgeCount from './utils/badge' and setBadgeCount (and/or clearBadge) from './notificationService'",
  },
  {
    name: "2. refreshBadge callback computes the count and passes it to setBadgeCount",
    match: (app) => {
      const body = extractRefreshBadgeBody(app);
      if (!body) return false;
      const computed = /const\s+(\w+)\s*=\s*computeBadgeCount\(/.exec(body);
      if (!computed) return false;
      const countVar = computed[1];
      const passesComputedVar = new RegExp(
        `setBadgeCount\\(\\s*${countVar}\\s*\\)`
      ).test(body);
      const passesLiteral = /setBadgeCount\(\s*\d+\s*\)/.test(body);
      return passesComputedVar && !passesLiteral;
    },
    message:
      "App.tsx must have a refreshBadge useCallback whose body calls computeBadgeCount(...) and passes the resulting variable (not a literal) to setBadgeCount(...)",
  },
  {
    name: "3. task-change effect calls refreshBadge(tasks) and depends on tasks",
    match: (app) => {
      const effect = extractTaskChangeEffect(app);
      if (!effect) return false;
      return ["tasks", "dbReady", "refreshBadge"].every((d) =>
        new RegExp(`\\b${d}\\b`).test(effect.deps)
      );
    },
    message:
      "App.tsx must have a useEffect that calls refreshBadge(tasks) and lists tasks, dbReady and refreshBadge in its dependency array, so it runs on mount (after dbReady) and after every loadTasks()",
  },
  {
    name: "4. refreshBadge (or setBadgeCount) is referenced inside the notification-response wiring",
    match: (app) => {
      const start = app.indexOf("setupNotificationResponseHandler(");
      if (start === -1) return false;
      const nextAnchor = app.indexOf(
        "setupOverlayAlarmResponseHandler(",
        start
      );
      const end = nextAnchor !== -1 ? nextAnchor : app.length;
      const block = app.slice(start, end);
      return /refreshBadge\s*\(|setBadgeCount\s*\(/.test(block);
    },
    message:
      "App.tsx's setupNotificationResponseHandler wiring must reference refreshBadge (or setBadgeCount) so the badge updates on Done/Postpone/Re-roll from the notification tray",
  },
  {
    name: "5. task-change effect is guarded so it does not fire while onboarding is showing",
    match: (app) => {
      const effect = extractTaskChangeEffect(app);
      if (!effect) return false;
      return /showOnboarding\s*(===|!==)\s*false/.test(effect.body);
    },
    message:
      "App.tsx's badge refresh effect must guard on showOnboarding === false (or an equivalent !== false early return) so the badge does not refresh while the onboarding gate is showing",
  },
  {
    name: "6. badge calls are fire-and-forget (voided/caught, never awaited in the render path)",
    match: (app) => {
      const neverAwaited = !/await\s+setBadgeCount\s*\(/.test(app);
      const voidedOrCaught =
        /void\s+setBadgeCount\s*\(/.test(app) ||
        /setBadgeCount\([^)]*\)\s*\.catch\(/.test(app);
      return neverAwaited && voidedOrCaught;
    },
    message:
      "App.tsx must never `await setBadgeCount(...)` outside an async helper; the call site must be voided (void setBadgeCount(...)) or chained with .catch(...)",
  },
  {
    name: "7. the badge can be cleared to 0 (no early return skips setBadgeCount when the count is 0)",
    match: (app) => {
      const body = extractRefreshBadgeBody(app);
      if (!body) return false;
      const hasZeroGuard = /if\s*\([^)]*count[^)]*\)\s*return\s*;/.test(body);
      const callsSetBadgeCount = /setBadgeCount\s*\(/.test(body);
      return callsSetBadgeCount && !hasZeroGuard;
    },
    message:
      "App.tsx's refreshBadge callback must not early-return before calling setBadgeCount when the computed count is 0 — the badge must be clearable, not left stale",
  },
];

describe("App.tsx badge refresh wiring", () => {
  for (const check of CHECKS) {
    it(check.name, () => {
      const passed = check.match(appSrc);
      if (!passed) {
        throw new Error(`[badgeWiring] ${check.message}`);
      }
      expect(passed).toBe(true);
    });
  }
});
