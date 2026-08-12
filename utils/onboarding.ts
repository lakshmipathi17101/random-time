/**
 * Phase 14 — onboarding gate logic.
 *
 * Pure, testable gate for the 3-screen first-launch onboarding flow.
 * Persistence is backed by the existing SQLite settings table (db.ts) —
 * no extra dependency is introduced.
 */

import { getSetting, upsertSetting } from "../db";

export interface OnboardingStep {
  key: string;
  title: string;
  body: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: "welcome",
    title: "Welcome to RandomTime",
    body: "RandomTime helps you schedule tasks at a random time within a window you choose, so your day stays flexible.",
  },
  {
    key: "how-it-works",
    title: "How it works",
    body: "Add a task, set a time range, and we'll pick a random moment inside it — then remind you when it's time.",
  },
  {
    key: "permissions",
    title: "Permissions",
    body: "RandomTime needs notification and alarm permissions to remind you at the right moment. You can grant these next.",
  },
];

/**
 * Returns true only when the stored 'onboarded' setting is not '1'.
 * (i.e. first launch, or the value has never been set / was reset.)
 */
export function shouldShowOnboarding(saved: string | null): boolean {
  return saved !== "1";
}

/** Reads the stored 'onboarded' setting and reports whether onboarding is complete. */
export async function isOnboarded(): Promise<boolean> {
  const saved = await getSetting("onboarded");
  return !shouldShowOnboarding(saved);
}

/** Marks onboarding as complete by persisting 'onboarded' = '1'. */
export async function completeOnboarding(): Promise<void> {
  await upsertSetting("onboarded", "1");
}
