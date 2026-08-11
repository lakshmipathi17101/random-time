/**
 * Unit tests for overlayAlarmBridge.ts
 *
 * All 8 acceptance criteria:
 *  1. isOverlayAlarmAvailable defaults to false (no NativeModules.OverlayAlarm)
 *  2. __setOverlayAlarmAvailable overrides correctly (true / false / null)
 *  3. fireOverlayAlarm returns {fired:'unavailable'} when module absent + console.warn fires once
 *  4. fireOverlayAlarm returns {fired:'permission_denied'} on ERR_OVERLAY_NOT_GRANTED rejection
 *  5. fireOverlayAlarm returns {fired:'overlay'} when module resolves
 *  6. dismissOverlayAlarm no-ops (does not throw) when module absent
 *  7. onAlarmAction listener receives payloads driven by __emitOverlayAlarmAction
 *  8. unsubscribe returned by onAlarmAction removes the listener
 *
 * react-native NativeModules is mocked per-test via jest.mock + module
 * re-require patterns that mirror nativeAppControl.test.ts.
 */

// ---------------------------------------------------------------------------
// We rely on the module's own test hooks rather than mocking react-native's
// NativeModules globally (which would be hard to reset per-test due to Jest
// module registry caching).  The bridge exposes __resetOverlayAlarmCache and
// __setOverlayAlarmAvailable precisely for this purpose.
// ---------------------------------------------------------------------------

jest.mock("react-native", () => ({
  NativeModules: {},
  NativeEventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
    removeAllListeners: jest.fn(),
  })),
}));

import overlayAlarmBridge, {
  isOverlayAlarmAvailable,
  __setOverlayAlarmAvailable,
  __resetOverlayAlarmCache,
  __emitOverlayAlarmAction,
  OverlayAlarmAction,
} from "../overlayAlarmBridge";

// Helper: give us a fresh NativeModules ref from the mocked react-native
function getMockNativeModules() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("react-native").NativeModules as Record<string, unknown>;
}

beforeEach(() => {
  // Reset the cached native lookup so each test starts from a clean slate.
  __resetOverlayAlarmCache();
  // Clear any forced availability override.
  __setOverlayAlarmAvailable(null);
  // Ensure OverlayAlarm is not present by default.
  const mods = getMockNativeModules();
  delete mods.OverlayAlarm;
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// 1. isOverlayAlarmAvailable defaults to false
// ---------------------------------------------------------------------------
describe("isOverlayAlarmAvailable", () => {
  it("defaults to false in jest env (NativeModules.OverlayAlarm absent)", () => {
    expect(isOverlayAlarmAvailable()).toBe(false);
  });

  // 2. __setOverlayAlarmAvailable overrides
  it("__setOverlayAlarmAvailable(true) forces true", () => {
    __setOverlayAlarmAvailable(true);
    expect(isOverlayAlarmAvailable()).toBe(true);
  });

  it("__setOverlayAlarmAvailable(false) forces false even when native is present", () => {
    // Inject a fake native module.
    getMockNativeModules().OverlayAlarm = {
      fireOverlayAlarm: jest.fn(),
      dismissOverlayAlarm: jest.fn(),
      scheduleOverlayAlarm: jest.fn(),
      cancelOverlayAlarm: jest.fn(),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    __resetOverlayAlarmCache();
    __setOverlayAlarmAvailable(false);
    expect(isOverlayAlarmAvailable()).toBe(false);
  });

  it("__setOverlayAlarmAvailable(null) clears override and returns to probe result", () => {
    __setOverlayAlarmAvailable(true);
    __setOverlayAlarmAvailable(null);
    // No native module → false.
    expect(isOverlayAlarmAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. fireOverlayAlarm — module absent path
// ---------------------------------------------------------------------------
describe("fireOverlayAlarm — module absent", () => {
  it("returns {fired:'unavailable'} when native module is absent", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    const result = await overlayAlarmBridge.fireOverlayAlarm("task-1", "Do laundry");
    expect(result).toEqual({ fired: "unavailable" });
    warnSpy.mockRestore();
  });

  it("emits console.warn exactly once across multiple calls (warn guard)", async () => {
    // _warnedUnavailable is module-level state. We load a fresh module instance
    // via jest.isolateModules so the warn guard starts at false regardless of
    // what earlier tests did.
    await jest.isolateModules(async () => {
      const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const bridge = require("../overlayAlarmBridge").default;

      await bridge.fireOverlayAlarm("task-1", "First call");
      await bridge.fireOverlayAlarm("task-2", "Second call");
      await bridge.fireOverlayAlarm("task-3", "Third call");

      // The bridge should only warn once regardless of how many times we call.
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toContain("OverlayAlarm");
      warnSpy.mockRestore();
    });
  });
});

// ---------------------------------------------------------------------------
// 4. fireOverlayAlarm — ERR_OVERLAY_NOT_GRANTED path
// ---------------------------------------------------------------------------
describe("fireOverlayAlarm — permission denied path", () => {
  it("returns {fired:'permission_denied'} when native rejects with ERR_OVERLAY_NOT_GRANTED", async () => {
    const permError = Object.assign(new Error("Overlay permission denied"), {
      code: "ERR_OVERLAY_NOT_GRANTED",
    });
    const mockFire = jest.fn().mockRejectedValue(permError);
    getMockNativeModules().OverlayAlarm = {
      fireOverlayAlarm: mockFire,
      dismissOverlayAlarm: jest.fn(),
      scheduleOverlayAlarm: jest.fn(),
      cancelOverlayAlarm: jest.fn(),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    __resetOverlayAlarmCache();

    const result = await overlayAlarmBridge.fireOverlayAlarm("task-5", "Gym session");
    expect(result).toEqual({ fired: "permission_denied" });
  });
});

// ---------------------------------------------------------------------------
// 5. fireOverlayAlarm — module present, success path
// ---------------------------------------------------------------------------
describe("fireOverlayAlarm — module present", () => {
  it("returns {fired:'overlay'} when native module resolves", async () => {
    const mockFire = jest.fn().mockResolvedValue(undefined);
    getMockNativeModules().OverlayAlarm = {
      fireOverlayAlarm: mockFire,
      dismissOverlayAlarm: jest.fn(),
      scheduleOverlayAlarm: jest.fn(),
      cancelOverlayAlarm: jest.fn(),
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    };
    __resetOverlayAlarmCache();

    const result = await overlayAlarmBridge.fireOverlayAlarm("task-10", "Run 5k");
    expect(result).toEqual({ fired: "overlay" });
    expect(mockFire).toHaveBeenCalledWith("task-10", "Run 5k");
  });
});

// ---------------------------------------------------------------------------
// 6. dismissOverlayAlarm — no-op when absent
// ---------------------------------------------------------------------------
describe("dismissOverlayAlarm — module absent", () => {
  it("does not throw when native module is absent", async () => {
    await expect(
      overlayAlarmBridge.dismissOverlayAlarm("task-99")
    ).resolves.toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. onAlarmAction — listener receives payloads via __emitOverlayAlarmAction
// (internal Set path — no native module)
// ---------------------------------------------------------------------------
describe("onAlarmAction — fallback listener path (module absent)", () => {
  it("listener is called with the emitted payload", () => {
    const received: OverlayAlarmAction[] = [];
    overlayAlarmBridge.onAlarmAction((payload) => received.push(payload));

    const p1: OverlayAlarmAction = { taskId: "t-1", action: "done" };
    const p2: OverlayAlarmAction = { taskId: "t-2", action: "postpone" };
    __emitOverlayAlarmAction(p1);
    __emitOverlayAlarmAction(p2);

    expect(received).toEqual([p1, p2]);
  });

  // 8. unsubscribe removes the listener
  it("unsubscribe stops the listener from receiving further events", () => {
    const received: OverlayAlarmAction[] = [];
    const off = overlayAlarmBridge.onAlarmAction((payload) => received.push(payload));

    __emitOverlayAlarmAction({ taskId: "t-1", action: "done" });
    off();
    __emitOverlayAlarmAction({ taskId: "t-2", action: "reroll" });

    // Only the first event should have been received.
    expect(received).toHaveLength(1);
    expect(received[0].taskId).toBe("t-1");
  });
});

// ---------------------------------------------------------------------------
// __emitOverlayAlarmAction — explicit hook test
// ---------------------------------------------------------------------------
describe("__emitOverlayAlarmAction test hook", () => {
  it("routes action payloads to all subscribed listeners simultaneously", () => {
    const calls1: string[] = [];
    const calls2: string[] = [];
    overlayAlarmBridge.onAlarmAction((p) => calls1.push(p.action));
    overlayAlarmBridge.onAlarmAction((p) => calls2.push(p.action));

    __emitOverlayAlarmAction({ taskId: "t-x", action: "reroll" });

    expect(calls1).toEqual(["reroll"]);
    expect(calls2).toEqual(["reroll"]);
  });
});
