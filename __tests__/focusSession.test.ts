import {
  DEFAULT_EMERGENCY_UNLOCK_COOLDOWN_MS,
  DEFAULT_EMERGENCY_UNLOCK_POLICY,
  canEmergencyUnlock,
  formatRemaining,
  isActive,
  isExpired,
  isPackageBlocked,
  makePendingSession,
  timeRemainingMs,
  timeRemainingSeconds,
} from "../utils/focusSession";
import type { FocusSession } from "../types/appControl";

function makeSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 1,
    startTs: 1_000,
    endTs: 60_000,
    endedAt: null,
    blockedPackages: ["com.instagram.android", "com.zhiliaoapp.musically"],
    emergencyUnlocks: 0,
    source: "manual",
    endReason: null,
    ...overrides,
  };
}

describe("isExpired / isActive", () => {
  it("active session: before endTs, not ended", () => {
    const s = makeSession();
    expect(isActive(s, 30_000)).toBe(true);
    expect(isExpired(s, 30_000)).toBe(false);
  });

  it("session past endTs is expired and not active", () => {
    const s = makeSession();
    expect(isActive(s, 60_000)).toBe(false); // exactly endTs counts as expired
    expect(isActive(s, 999_999)).toBe(false);
    expect(isExpired(s, 60_000)).toBe(true);
  });

  it("explicitly-ended session is inactive and expired", () => {
    const s = makeSession({ endedAt: 20_000 });
    expect(isActive(s, 10_000)).toBe(false);
    expect(isExpired(s, 10_000)).toBe(true);
  });
});

describe("isPackageBlocked", () => {
  it("blocks listed packages while active", () => {
    const s = makeSession();
    expect(isPackageBlocked(s, "com.instagram.android", 30_000)).toBe(true);
    expect(isPackageBlocked(s, "com.zhiliaoapp.musically", 30_000)).toBe(true);
  });

  it("does not block unlisted packages", () => {
    const s = makeSession();
    expect(isPackageBlocked(s, "com.android.dialer", 30_000)).toBe(false);
  });

  it("does not block once expired", () => {
    const s = makeSession({ endTs: 5_000 });
    expect(isPackageBlocked(s, "com.instagram.android", 10_000)).toBe(false);
  });

  it("does not block once explicitly ended", () => {
    const s = makeSession({ endedAt: 5_000 });
    expect(isPackageBlocked(s, "com.instagram.android", 3_000)).toBe(false);
  });

  it("empty blocklist blocks nothing (tracking-only session)", () => {
    const s = makeSession({ blockedPackages: [] });
    expect(isPackageBlocked(s, "com.instagram.android", 30_000)).toBe(false);
  });
});

describe("timeRemainingMs / timeRemainingSeconds", () => {
  it("counts down to zero", () => {
    const s = makeSession({ startTs: 0, endTs: 10_000 });
    expect(timeRemainingMs(s, 0)).toBe(10_000);
    expect(timeRemainingMs(s, 7_000)).toBe(3_000);
    expect(timeRemainingMs(s, 10_000)).toBe(0);
    expect(timeRemainingMs(s, 11_000)).toBe(0);
  });

  it("seconds is floor of ms/1000", () => {
    const s = makeSession({ startTs: 0, endTs: 10_500 });
    expect(timeRemainingSeconds(s, 0)).toBe(10);
    expect(timeRemainingSeconds(s, 500)).toBe(10);
  });

  it("ended session has zero remaining", () => {
    const s = makeSession({ endedAt: 1_000 });
    expect(timeRemainingMs(s, 0)).toBe(0);
  });
});

describe("canEmergencyUnlock", () => {
  it("denies when session is inactive", () => {
    const s = makeSession({ endedAt: 1_000 });
    const v = canEmergencyUnlock(s, 5_000, null);
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("session_inactive");
  });

  it("allows first unlock with no prior", () => {
    const s = makeSession();
    expect(canEmergencyUnlock(s, 10_000, null).allowed).toBe(true);
  });

  it("denies during cooldown", () => {
    const s = makeSession();
    const lastUnlockAt = 10_000;
    const tooSoon = lastUnlockAt + 1_000;
    const v = canEmergencyUnlock(s, tooSoon, lastUnlockAt);
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("cooldown");
    expect(v.nextAllowedAtMs).toBe(lastUnlockAt + DEFAULT_EMERGENCY_UNLOCK_COOLDOWN_MS);
  });

  it("allows after cooldown elapses", () => {
    // session must still be active at the after-cooldown timestamp,
    // so endTs needs to be > afterCooldown.
    const s = makeSession({ endTs: 10_000_000 });
    const lastUnlockAt = 10_000;
    const afterCooldown = lastUnlockAt + DEFAULT_EMERGENCY_UNLOCK_COOLDOWN_MS;
    expect(canEmergencyUnlock(s, afterCooldown, lastUnlockAt).allowed).toBe(true);
  });

  it("denies when cap reached", () => {
    const s = makeSession({ emergencyUnlocks: 3 });
    const v = canEmergencyUnlock(s, 10_000, null);
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe("cap_reached");
  });

  it("uncapped policy (cap=0) ignores count", () => {
    const s = makeSession({ emergencyUnlocks: 100, endTs: 1_000_000 });
    const policy = { cooldownMs: 0, perSessionCap: 0 };
    expect(canEmergencyUnlock(s, 500, null, policy).allowed).toBe(true);
  });

  it("policy overrides defaults", () => {
    const s = makeSession();
    const policy = { cooldownMs: 1_000, perSessionCap: 1 };
    expect(canEmergencyUnlock(s, 1_001, 1, policy).allowed).toBe(true);
    expect(canEmergencyUnlock(s, 999, 1, policy).allowed).toBe(false);
  });

  it("default policy values are exported as constants", () => {
    expect(DEFAULT_EMERGENCY_UNLOCK_POLICY.cooldownMs).toBe(
      DEFAULT_EMERGENCY_UNLOCK_COOLDOWN_MS
    );
    expect(DEFAULT_EMERGENCY_UNLOCK_POLICY.perSessionCap).toBe(3);
  });
});

describe("formatRemaining", () => {
  it("zero / negative / non-finite", () => {
    expect(formatRemaining(0)).toBe("0 sec");
    expect(formatRemaining(-5)).toBe("0 sec");
    expect(formatRemaining(NaN)).toBe("0 sec");
    expect(formatRemaining(Infinity)).toBe("0 sec");
  });

  it("under 60 → seconds", () => {
    expect(formatRemaining(1)).toBe("1 sec");
    expect(formatRemaining(59)).toBe("59 sec");
  });

  it("60+ → m:ss", () => {
    expect(formatRemaining(60)).toBe("1:00");
    expect(formatRemaining(125)).toBe("2:05");
    expect(formatRemaining(3725)).toBe("62:05");
  });

  it("floors fractional seconds", () => {
    expect(formatRemaining(59.9)).toBe("59 sec");
    expect(formatRemaining(125.7)).toBe("2:05");
  });
});

describe("makePendingSession", () => {
  it("builds a session with computed endTs and defaults", () => {
    const s = makePendingSession({
      startMs: 1_000_000,
      durationMinutes: 30,
      blockedPackages: ["com.foo", "com.bar"],
      source: "manual",
    });
    expect(s.startTs).toBe(1_000_000);
    expect(s.endTs).toBe(1_000_000 + 30 * 60 * 1000);
    expect(s.endedAt).toBeNull();
    expect(s.blockedPackages).toEqual(["com.foo", "com.bar"]);
    expect(s.emergencyUnlocks).toBe(0);
    expect(s.source).toBe("manual");
    expect(s.endReason).toBeNull();
  });

  it("defensively copies blockedPackages", () => {
    const input = ["com.foo"];
    const s = makePendingSession({
      startMs: 0,
      durationMinutes: 5,
      blockedPackages: input,
      source: "task",
    });
    input.push("com.bar");
    expect(s.blockedPackages).toEqual(["com.foo"]);
  });

  it("clamps negative durations to zero", () => {
    const s = makePendingSession({
      startMs: 1_000,
      durationMinutes: -10,
      blockedPackages: [],
      source: "manual",
    });
    expect(s.endTs).toBe(1_000);
  });
});
