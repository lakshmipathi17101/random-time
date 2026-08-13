/**
 * Verification for the App.tsx onboarding gate (random-time-rlk.4).
 *
 * random-time-rlk.3 covers utils/onboarding.ts in isolation; nothing else
 * verifies the App.tsx wiring that actually decides whether a first-time
 * user ever sees Onboarding.tsx. This is a plain jest + fs source-assertion
 * suite (no react renderer — the repo has neither @testing-library/react-native
 * nor react-test-renderer, and none may be added here).
 *
 * SCOPE: verification only. Adds exactly this one test file; changes no
 * source, config, or native file.
 */

import * as fs from "fs";
import * as path from "path";

const appSrc = fs.readFileSync(path.join(__dirname, "../App.tsx"), "utf8");
const onboardingSrc = fs.readFileSync(
  path.join(__dirname, "../Onboarding.tsx"),
  "utf8"
);

interface GateCheck {
  name: string;
  match: (app: string, onboarding: string) => boolean;
  message: string;
}

// Keep every check in this one table — adding a new check is one entry.
const CHECKS: GateCheck[] = [
  {
    name: "1. imports Onboarding and shouldShowOnboarding",
    match: (app) =>
      /import\s+Onboarding\s+from\s+["']\.\/Onboarding["']/.test(app) &&
      /import\s*\{\s*shouldShowOnboarding\s*\}\s*from\s*["']\.\/utils\/onboarding["']/.test(
        app
      ),
    message:
      "App.tsx must import Onboarding from './Onboarding' and shouldShowOnboarding from './utils/onboarding'",
  },
  {
    name: "2. declares showOnboarding: boolean | null, initialised to null",
    match: (app) =>
      /const\s*\[\s*showOnboarding\s*,\s*setShowOnboarding\s*\]\s*=\s*useState<\s*boolean\s*\|\s*null\s*>\(\s*null\s*\)/.test(
        app
      ),
    message:
      "App.tsx must declare `const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null)`",
  },
  {
    name: "3. resolves the 'onboarded' setting through shouldShowOnboarding(...)",
    match: (app) =>
      /await\s+getSetting\(\s*["']onboarded["']\s*\)/.test(app) &&
      /setShowOnboarding\(\s*shouldShowOnboarding\(/.test(app),
    message:
      "App.tsx's init effect must read getSetting('onboarded') and feed it through shouldShowOnboarding(...) to set showOnboarding",
  },
  {
    name: "4. guards on showOnboarding === null before any tab UI (no flash)",
    match: (app) => {
      const guard = /showOnboarding\s*===\s*null[\s\S]{0,40}\?\s*null\s*:/.exec(
        app
      );
      const tabRender = /activeTab\s*===\s*['"]Home['"]\s*\?/.exec(app);
      return !!guard && !!tabRender && guard.index < tabRender.index;
    },
    message:
      "App.tsx must have a `showOnboarding === null ... ? null :` (or equivalent !== false) guard that renders before the main tab UI, to avoid a flash of the tab content on first launch",
  },
  {
    name: "5. renders <Onboarding onDone=.../> inside SafeAreaProvider/SafeAreaView",
    match: (app) => {
      const providerOpen = app.indexOf("<SafeAreaProvider>");
      const viewOpen = app.indexOf("<SafeAreaView");
      const onboardingRender = /<Onboarding\b[^>]*\bonDone=\{[^}]*setShowOnboarding\(\s*false\s*\)[^}]*\}[^>]*\/>/.exec(
        app
      );
      const viewClose = app.lastIndexOf("</SafeAreaView>");
      const providerClose = app.lastIndexOf("</SafeAreaProvider>");
      return (
        providerOpen !== -1 &&
        viewOpen !== -1 &&
        !!onboardingRender &&
        viewClose !== -1 &&
        providerClose !== -1 &&
        providerOpen < viewOpen &&
        viewOpen < onboardingRender.index &&
        onboardingRender.index < viewClose &&
        viewClose < providerClose
      );
    },
    message:
      "App.tsx must conditionally render <Onboarding ... onDone={() => setShowOnboarding(false)} /> nested inside the existing SafeAreaProvider/SafeAreaView wrappers",
  },
  {
    name: "6. the Home/Progress tab render block is present exactly once (no regression)",
    match: (app) => {
      const matches = app.match(/activeTab\s*===\s*['"]Home['"]\s*\?/g) || [];
      return matches.length === 1;
    },
    message:
      "App.tsx must contain exactly one `activeTab === 'Home' ?` tab render ternary — the onboarding gate must not have replaced or duplicated the pre-existing Home/Progress tab render block",
  },
  {
    name: "7. Onboarding.tsx exports an ONBOARDING_STEPS-driven component with an onDone prop",
    match: (_app, onboarding) =>
      /ONBOARDING_STEPS/.test(onboarding) &&
      /onDone\s*:\s*\(\s*\)\s*=>\s*void/.test(onboarding),
    message:
      "Onboarding.tsx must still use ONBOARDING_STEPS to drive its 3-screen UI and declare an `onDone: () => void` prop (guards against a signature drift between rlk.2 and rlk.4)",
  },
];

describe("App.tsx onboarding gate wiring", () => {
  for (const check of CHECKS) {
    it(check.name, () => {
      const passed = check.match(appSrc, onboardingSrc);
      if (!passed) {
        throw new Error(`[onboardingGate] ${check.message}`);
      }
      expect(passed).toBe(true);
    });
  }
});
