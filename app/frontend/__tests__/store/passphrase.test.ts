import { describe, it, expect, beforeEach, vi, afterEach, type Mock } from "vitest";
import { usePassphraseStore } from "@/store/passphrase";
import * as deviceVault from "@/lib/device-vault";

// Device persistence is exercised via the store; mock it so tests never touch
// real IndexedDB/WebCrypto and can drive the "remember on this device" paths.
vi.mock("@/lib/device-vault", () => ({
  persistPassphrase: vi.fn(async () => {}),
  loadPassphrase: vi.fn(async () => null),
  clearPersistedPassphrase: vi.fn(async () => {}),
}));

describe("usePassphraseStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    usePassphraseStore.getState().clear();
    // Force a deterministic baseline: session mode (no device-remember).
    usePassphraseStore.getState().setRememberDevice(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should start with null passphrase", () => {
    expect(usePassphraseStore.getState().getPassphrase()).toBeNull();
  });

  it("should store and retrieve passphrase", () => {
    usePassphraseStore.getState().setPassphrase("mypass", 15);
    expect(usePassphraseStore.getState().getPassphrase()).toBe("mypass");
  });

  it("should return remaining minutes", () => {
    usePassphraseStore.getState().setPassphrase("mypass", 10);
    expect(usePassphraseStore.getState().getRemainingMinutes()).toBe(10);
  });

  it("should expire after TTL via getPassphrase check", () => {
    usePassphraseStore.getState().setPassphrase("mypass", 5);
    expect(usePassphraseStore.getState().getPassphrase()).toBe("mypass");

    // Advance past TTL
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(usePassphraseStore.getState().getPassphrase()).toBeNull();
  });

  it("should auto-clear via timer", () => {
    usePassphraseStore.getState().setPassphrase("mypass", 1);
    expect(usePassphraseStore.getState().cachedPassphrase).toBe("mypass");

    // Advance timer to trigger auto-clear
    vi.advanceTimersByTime(1 * 60 * 1000);
    expect(usePassphraseStore.getState().cachedPassphrase).toBeNull();
  });

  it("should clear passphrase manually", () => {
    usePassphraseStore.getState().setPassphrase("mypass");
    usePassphraseStore.getState().clear();
    expect(usePassphraseStore.getState().getPassphrase()).toBeNull();
  });

  it("should return 0 remaining minutes when not set", () => {
    expect(usePassphraseStore.getState().getRemainingMinutes()).toBe(0);
  });

  it("expires via getPassphrase when the clock passes TTL without the timer firing", () => {
    vi.setSystemTime(0);
    usePassphraseStore.getState().setPassphrase("mypass", 5);

    // setSystemTime advances the clock WITHOUT firing the pending auto-clear
    // timer, so getPassphrase itself must detect expiry and clear the cache
    // (the branch the "auto-clear via timer" test never reaches).
    vi.setSystemTime(5 * 60 * 1000 + 1);
    expect(usePassphraseStore.getState().getPassphrase()).toBeNull();
  });

  it("re-setting the passphrase resets the pending auto-clear timer", () => {
    const s = usePassphraseStore.getState();
    s.setPassphrase("a", 5);
    s.setPassphrase("b", 10); // must cancel the first 5-min timer
    expect(s.getPassphrase()).toBe("b");
    // The first timer would have fired here — confirm it did not.
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    expect(usePassphraseStore.getState().getPassphrase()).toBe("b");
    vi.advanceTimersByTime(5 * 60 * 1000);
    expect(usePassphraseStore.getState().getPassphrase()).toBeNull();
  });

  describe("remember-on-this-device", () => {
    it("stores a persistent (no-TTL) unlock when remember-device is on", () => {
      usePassphraseStore.getState().setRememberDevice(true);
      usePassphraseStore.getState().setPassphrase("pw", 15);
      const s = usePassphraseStore.getState();
      expect(s.persistent).toBe(true);
      expect(s.cacheUntil).toBeNull();
      expect(s.getRemainingMinutes()).toBe(Infinity);
      // No TTL: still unlocked far in the future.
      vi.advanceTimersByTime(60 * 60 * 1000);
      expect(usePassphraseStore.getState().getPassphrase()).toBe("pw");
      expect(deviceVault.persistPassphrase).toHaveBeenCalledWith("pw");
    });

    it("upgrades an active session to a persistent unlock", () => {
      const s = usePassphraseStore.getState();
      s.setPassphrase("pw", 15); // session (remember off)
      expect(usePassphraseStore.getState().persistent).toBe(false);
      s.setRememberDevice(true);
      const after = usePassphraseStore.getState();
      expect(after.persistent).toBe(true);
      expect(after.cacheUntil).toBeNull();
      expect(deviceVault.persistPassphrase).toHaveBeenCalledWith("pw");
    });

    it("opting out downgrades a persistent unlock to a 15-min session", () => {
      const s = usePassphraseStore.getState();
      s.setRememberDevice(true);
      s.setPassphrase("pw", 15); // persistent
      s.setRememberDevice(false); // opt out
      const after = usePassphraseStore.getState();
      expect(after.persistent).toBe(false);
      expect(after.cacheUntil).not.toBeNull();
      expect(deviceVault.clearPersistedPassphrase).toHaveBeenCalled();
      // The fresh 15-min timer still expires it.
      vi.advanceTimersByTime(15 * 60 * 1000);
      expect(usePassphraseStore.getState().cachedPassphrase).toBeNull();
    });

    it("opting out with no active unlock just clears the preference", () => {
      usePassphraseStore.getState().setRememberDevice(false);
      expect(usePassphraseStore.getState().persistent).toBe(false);
      expect(deviceVault.clearPersistedPassphrase).toHaveBeenCalled();
    });

    it("rehydrate restores a device-persisted passphrase", async () => {
      (deviceVault.loadPassphrase as Mock).mockResolvedValueOnce("remembered");
      usePassphraseStore.getState().setRememberDevice(true);
      usePassphraseStore.setState({
        cachedPassphrase: null,
        cacheUntil: null,
        persistent: false,
      });
      await usePassphraseStore.getState().rehydrate();
      const s = usePassphraseStore.getState();
      expect(s.cachedPassphrase).toBe("remembered");
      expect(s.persistent).toBe(true);
    });

    it("rehydrate is a no-op when remember-device is off", async () => {
      usePassphraseStore.getState().setRememberDevice(false);
      await usePassphraseStore.getState().rehydrate();
      expect(usePassphraseStore.getState().cachedPassphrase).toBeNull();
      expect(deviceVault.loadPassphrase).not.toHaveBeenCalled();
    });

    it("rehydrate is a no-op when already unlocked this session", async () => {
      const s = usePassphraseStore.getState();
      s.setRememberDevice(true);
      s.setPassphrase("pw"); // already cached
      await usePassphraseStore.getState().rehydrate();
      expect(deviceVault.loadPassphrase).not.toHaveBeenCalled();
    });

    it("rehydrate leaves the vault locked when nothing is stored on-device", async () => {
      usePassphraseStore.getState().setRememberDevice(true);
      usePassphraseStore.setState({
        cachedPassphrase: null,
        cacheUntil: null,
        persistent: false,
      });
      (deviceVault.loadPassphrase as Mock).mockResolvedValueOnce(null);
      await usePassphraseStore.getState().rehydrate();
      expect(usePassphraseStore.getState().cachedPassphrase).toBeNull();
      expect(deviceVault.loadPassphrase).toHaveBeenCalled();
    });

    it("re-enabling remember-device while already persistent is idempotent", () => {
      const s = usePassphraseStore.getState();
      s.setRememberDevice(true);
      s.setPassphrase("pw"); // persistent: no pending timer
      s.setRememberDevice(true); // pp set + no timer → exercises the no-timer branch
      expect(usePassphraseStore.getState().persistent).toBe(true);
    });

    it("tolerates a localStorage write failure when toggling the preference", () => {
      const spy = vi
        .spyOn(Storage.prototype, "setItem")
        .mockImplementation(() => {
          throw new Error("denied");
        });
      expect(() =>
        usePassphraseStore.getState().setRememberDevice(true)
      ).not.toThrow();
      spy.mockRestore();
    });

    it("clears a leftover pending timer when opting out from a force-set persistent state", () => {
      const s = usePassphraseStore.getState();
      s.setPassphrase("pw", 5); // session mode: leaves a real pending clearTimer
      // The public API always clears any pending timer before persistent becomes
      // true, so `persistent: true` with a live timer can't happen through it.
      // Force that combination directly to exercise the opt-out path's defensive
      // `if (clearTimer)` cleanup.
      usePassphraseStore.setState({ persistent: true });
      expect(() => s.setRememberDevice(false)).not.toThrow();
      const after = usePassphraseStore.getState();
      expect(after.persistent).toBe(false);
      expect(after.cacheUntil).not.toBeNull();
    });
  });

  describe("getter edge cases", () => {
    it("getPassphrase returns null for a non-persistent entry with no expiry set", () => {
      usePassphraseStore.setState({
        cachedPassphrase: "x",
        cacheUntil: null,
        persistent: false,
      });
      expect(usePassphraseStore.getState().getPassphrase()).toBeNull();
    });

    it("getRemainingMinutes returns 0 for an already-expired entry", () => {
      vi.setSystemTime(10_000);
      usePassphraseStore.setState({
        cachedPassphrase: "x",
        cacheUntil: 5_000,
        persistent: false,
      });
      expect(usePassphraseStore.getState().getRemainingMinutes()).toBe(0);
    });

    it("clears the cache on lazy expiry even when no timer is pending (state set directly)", () => {
      usePassphraseStore.setState({
        cachedPassphrase: "x",
        cacheUntil: Date.now() - 1000,
        persistent: false,
      });
      expect(usePassphraseStore.getState().getPassphrase()).toBeNull();
      expect(usePassphraseStore.getState().cachedPassphrase).toBeNull();
    });
  });

  describe("SSR safety (no window)", () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("writeRememberPref no-ops under SSR instead of throwing", () => {
      vi.stubGlobal("window", undefined);
      expect(() =>
        usePassphraseStore.getState().setRememberDevice(true)
      ).not.toThrow();
    });

    it("readRememberPref defaults rememberDevice to false at SSR module-init time", async () => {
      vi.resetModules();
      vi.stubGlobal("window", undefined);
      const mod = await import("@/store/passphrase");
      expect(mod.usePassphraseStore.getState().rememberDevice).toBe(false);
      vi.resetModules();
    });
  });
});
