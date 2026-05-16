import nativeAppControl, {
  __emitForegroundAppChanged,
  __resetAppControlMock,
  __setAppControlAvailable,
  __setMockPermissions,
  __setMockUsageRows,
  isAppControlAvailable,
} from "../nativeAppControl";

beforeEach(() => {
  __resetAppControlMock();
  __setAppControlAvailable(null);
});

describe("isAppControlAvailable", () => {
  it("defaults to false (no native module wired in managed Expo)", () => {
    expect(isAppControlAvailable()).toBe(false);
  });

  it("can be forced true/false for tests", () => {
    __setAppControlAvailable(true);
    expect(isAppControlAvailable()).toBe(true);
    __setAppControlAvailable(false);
    expect(isAppControlAvailable()).toBe(false);
    __setAppControlAvailable(null);
    expect(isAppControlAvailable()).toBe(false);
  });
});

describe("getInstalledApps", () => {
  it("returns launcher, non-system apps by default", async () => {
    const apps = await nativeAppControl.getInstalledApps();
    expect(apps.length).toBeGreaterThan(0);
    expect(apps.every((a) => !a.isSystem)).toBe(true);
    expect(apps.every((a) => a.isLauncher)).toBe(true);
  });
});

describe("permissions", () => {
  it("starts denied", async () => {
    const p = await nativeAppControl.getPermissionStatus();
    expect(p).toEqual({ usageStats: false, overlay: false, accessibility: false });
  });

  it("request flips the corresponding flag", async () => {
    await nativeAppControl.requestUsageStatsPermission();
    expect((await nativeAppControl.getPermissionStatus()).usageStats).toBe(true);
    await nativeAppControl.requestOverlayPermission();
    expect((await nativeAppControl.getPermissionStatus()).overlay).toBe(true);
    await nativeAppControl.requestAccessibilityPermission();
    expect((await nativeAppControl.getPermissionStatus()).accessibility).toBe(true);
  });

  it("__setMockPermissions seeds state", async () => {
    __setMockPermissions({ accessibility: true });
    const p = await nativeAppControl.getPermissionStatus();
    expect(p.accessibility).toBe(true);
    expect(p.overlay).toBe(false);
  });
});

describe("focus sessions", () => {
  it("starts a session and returns a handle", async () => {
    const h = await nativeAppControl.startFocusSession({
      blockedPackages: ["com.instagram.android"],
      durationMinutes: 30,
      source: "manual",
    });
    expect(h.sessionId).toBeGreaterThan(0);
    const active = await nativeAppControl.getActiveSession();
    expect(active).not.toBeNull();
    expect(active!.blockedPackages).toEqual(["com.instagram.android"]);
  });

  it("refuses to start a second session while one is active", async () => {
    await nativeAppControl.startFocusSession({
      blockedPackages: [],
      durationMinutes: 1,
      source: "manual",
    });
    await expect(
      nativeAppControl.startFocusSession({
        blockedPackages: [],
        durationMinutes: 1,
        source: "manual",
      })
    ).rejects.toThrow(/already active/);
  });

  it("ends a session, after which getActiveSession returns null", async () => {
    const h = await nativeAppControl.startFocusSession({
      blockedPackages: [],
      durationMinutes: 1,
      source: "manual",
    });
    await nativeAppControl.endFocusSession(h, "user_ended");
    expect(await nativeAppControl.getActiveSession()).toBeNull();
  });

  it("emergency unlock increments and returns the new total", async () => {
    const h = await nativeAppControl.startFocusSession({
      blockedPackages: ["com.instagram.android"],
      durationMinutes: 10,
      source: "manual",
    });
    expect(await nativeAppControl.useEmergencyUnlock(h)).toBe(1);
    expect(await nativeAppControl.useEmergencyUnlock(h)).toBe(2);
    const active = await nativeAppControl.getActiveSession();
    expect(active!.emergencyUnlocks).toBe(2);
  });

  it("emergency unlock throws when no session active", async () => {
    await expect(
      nativeAppControl.useEmergencyUnlock({ sessionId: 999 })
    ).rejects.toThrow();
  });

  it("session ID increments across sessions", async () => {
    const h1 = await nativeAppControl.startFocusSession({
      blockedPackages: [],
      durationMinutes: 1,
      source: "manual",
    });
    await nativeAppControl.endFocusSession(h1, "user_ended");
    const h2 = await nativeAppControl.startFocusSession({
      blockedPackages: [],
      durationMinutes: 1,
      source: "manual",
    });
    expect(h2.sessionId).toBeGreaterThan(h1.sessionId);
  });
});

describe("usage stats", () => {
  it("returns seeded rows", async () => {
    __setMockUsageRows([
      { packageName: "com.instagram.android", foregroundSeconds: 1200, lastTimeUsedMs: 1 },
      { packageName: "com.zhiliaoapp.musically", foregroundSeconds: 2400, lastTimeUsedMs: 2 },
    ]);
    const rows = await nativeAppControl.getUsageStats(0);
    expect(rows).toHaveLength(2);
    expect(rows[0].packageName).toBe("com.instagram.android");
  });
});

describe("events", () => {
  it("foreground listener is called on emit", () => {
    const seen: string[] = [];
    const off = nativeAppControl.onForegroundAppChanged((e) =>
      seen.push(e.packageName)
    );
    __emitForegroundAppChanged({ packageName: "com.foo", timestampMs: 1 });
    __emitForegroundAppChanged({ packageName: "com.bar", timestampMs: 2 });
    expect(seen).toEqual(["com.foo", "com.bar"]);
    off();
    __emitForegroundAppChanged({ packageName: "com.baz", timestampMs: 3 });
    expect(seen).toEqual(["com.foo", "com.bar"]);
  });

  it("blocked-app event fires when emitting a blocked package mid-session", async () => {
    const h = await nativeAppControl.startFocusSession({
      blockedPackages: ["com.instagram.android"],
      durationMinutes: 30,
      source: "manual",
    });
    const blocked: string[] = [];
    nativeAppControl.onBlockedAppLaunched((e) => blocked.push(e.packageName));

    __emitForegroundAppChanged({
      packageName: "com.instagram.android",
      timestampMs: 1,
    });
    __emitForegroundAppChanged({ packageName: "com.foo", timestampMs: 2 });

    expect(blocked).toEqual(["com.instagram.android"]);
    await nativeAppControl.endFocusSession(h, "user_ended");
  });

  it("blocked-app event does NOT fire after session ends", async () => {
    const h = await nativeAppControl.startFocusSession({
      blockedPackages: ["com.instagram.android"],
      durationMinutes: 30,
      source: "manual",
    });
    const blocked: string[] = [];
    nativeAppControl.onBlockedAppLaunched((e) => blocked.push(e.packageName));
    await nativeAppControl.endFocusSession(h, "user_ended");
    __emitForegroundAppChanged({
      packageName: "com.instagram.android",
      timestampMs: 1,
    });
    expect(blocked).toEqual([]);
  });
});
