import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => (store.has(k) ? (store.get(k) as string) : null)),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: vi.fn((k: string) => store.delete(k)),
    clear: vi.fn(() => store.clear()),
  };
}

describe("usePreferencesStore", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("localStorage", makeLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults advancedMode to false when localStorage has no flag", async () => {
    const { usePreferencesStore } = await import("@/store/preferences");
    expect(usePreferencesStore.getState().advancedMode).toBe(false);
  });

  it("initializes advancedMode to true when the localStorage flag is 'true'", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("true");
    const { usePreferencesStore } = await import("@/store/preferences");
    expect(usePreferencesStore.getState().advancedMode).toBe(true);
  });

  it("initializes advancedMode to false when the localStorage flag is some other value", async () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("nope");
    const { usePreferencesStore } = await import("@/store/preferences");
    expect(usePreferencesStore.getState().advancedMode).toBe(false);
  });

  it("defaults to false when window is undefined (SSR)", async () => {
    vi.stubGlobal("window", undefined);
    const { usePreferencesStore } = await import("@/store/preferences");
    expect(usePreferencesStore.getState().advancedMode).toBe(false);
  });

  it("setAdvancedMode(true) updates state and persists to localStorage", async () => {
    const { usePreferencesStore } = await import("@/store/preferences");
    usePreferencesStore.getState().setAdvancedMode(true);
    expect(usePreferencesStore.getState().advancedMode).toBe(true);
    expect(localStorage.setItem).toHaveBeenCalledWith("zcrypt-advanced-mode", "true");
  });

  it("setAdvancedMode(false) updates state and persists to localStorage", async () => {
    const { usePreferencesStore } = await import("@/store/preferences");
    usePreferencesStore.getState().setAdvancedMode(true);
    usePreferencesStore.getState().setAdvancedMode(false);
    expect(usePreferencesStore.getState().advancedMode).toBe(false);
    expect(localStorage.setItem).toHaveBeenCalledWith("zcrypt-advanced-mode", "false");
  });
  describe("sound preferences", () => {
    const saved = (value: unknown) =>
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((k: string) =>
        k === "zcrypt-sound-prefs" ? JSON.stringify(value) : null,
      );

    it("defaults to soft, everything on, background only", async () => {
      const { usePreferencesStore, DEFAULT_SOUND_PREFS } = await import("@/store/preferences");
      expect(usePreferencesStore.getState().sound).toEqual(DEFAULT_SOUND_PREFS);
      expect(DEFAULT_SOUND_PREFS).toMatchObject({
        enabled: true,
        set: "soft",
        vibrate: true,
        backgroundOnly: true,
      });
    });

    it("defaults to the built-in choices when window is undefined (SSR)", async () => {
      vi.stubGlobal("window", undefined);
      const { usePreferencesStore, DEFAULT_SOUND_PREFS } = await import("@/store/preferences");
      expect(usePreferencesStore.getState().sound).toEqual(DEFAULT_SOUND_PREFS);
    });

    it("reads saved choices and fills in anything missing or invalid", async () => {
      saved({ enabled: false, set: "glass", areas: { sharing: false, security: "no" }, vibrate: false });
      const { loadSoundPrefs } = await import("@/store/preferences");
      expect(loadSoundPrefs()).toEqual({
        enabled: false,
        set: "glass",
        areas: { transfers: true, sharing: false, security: true, problems: true },
        vibrate: false,
        backgroundOnly: true,
      });
    });

    it("keeps valid booleans for background only and ignores an unknown set", async () => {
      saved({ set: "loud", backgroundOnly: false });
      const { loadSoundPrefs } = await import("@/store/preferences");
      expect(loadSoundPrefs()).toMatchObject({ set: "soft", backgroundOnly: false });
    });

    it("falls back to defaults for null, non-object or unreadable storage", async () => {
      const { loadSoundPrefs, DEFAULT_SOUND_PREFS } = await import("@/store/preferences");
      saved(null);
      expect(loadSoundPrefs()).toEqual(DEFAULT_SOUND_PREFS);
      saved(7);
      expect(loadSoundPrefs()).toEqual(DEFAULT_SOUND_PREFS);
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue("{broken");
      expect(loadSoundPrefs()).toEqual(DEFAULT_SOUND_PREFS);
    });

    it("setSound merges, updates state and persists", async () => {
      const { usePreferencesStore } = await import("@/store/preferences");
      usePreferencesStore.getState().setSound({ set: "minimal", vibrate: false });
      expect(usePreferencesStore.getState().sound).toMatchObject({ set: "minimal", vibrate: false, enabled: true });
      const [key, value] = (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls.at(-1) as string[];
      expect(key).toBe("zcrypt-sound-prefs");
      expect(JSON.parse(value).set).toBe("minimal");
    });

    it("setSoundArea flips one area and leaves the rest", async () => {
      const { usePreferencesStore } = await import("@/store/preferences");
      usePreferencesStore.getState().setSoundArea("security", false);
      expect(usePreferencesStore.getState().sound.areas).toEqual({
        transfers: true,
        sharing: true,
        security: false,
        problems: true,
      });
    });

    it("still applies a choice when storage refuses the write", async () => {
      (localStorage.setItem as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("blocked");
      });
      const { usePreferencesStore } = await import("@/store/preferences");
      usePreferencesStore.getState().setSound({ enabled: false });
      expect(usePreferencesStore.getState().sound.enabled).toBe(false);
    });
  });

  describe("notification preferences", () => {
    it("shows photo previews by default, also during SSR", async () => {
      const { usePreferencesStore, DEFAULT_NOTIFY_PREFS } = await import("@/store/preferences");
      expect(usePreferencesStore.getState().notify).toEqual(DEFAULT_NOTIFY_PREFS);
      expect(DEFAULT_NOTIFY_PREFS.thumbnails).toBe(true);
      vi.resetModules();
      vi.stubGlobal("window", undefined);
      const ssr = await import("@/store/preferences");
      expect(ssr.usePreferencesStore.getState().notify).toEqual(DEFAULT_NOTIFY_PREFS);
    });

    it("reads a saved choice and ignores anything invalid or unreadable", async () => {
      const { loadNotifyPrefs } = await import("@/store/preferences");
      const getItem = localStorage.getItem as ReturnType<typeof vi.fn>;
      getItem.mockReturnValue(JSON.stringify({ thumbnails: false }));
      expect(loadNotifyPrefs()).toEqual({ thumbnails: false });
      getItem.mockReturnValue(JSON.stringify({ thumbnails: "no" }));
      expect(loadNotifyPrefs()).toEqual({ thumbnails: true });
      getItem.mockReturnValue(null);
      expect(loadNotifyPrefs()).toEqual({ thumbnails: true });
      getItem.mockReturnValue("{broken");
      expect(loadNotifyPrefs()).toEqual({ thumbnails: true });
    });

    it("setNotify updates state and persists under its own key", async () => {
      const { usePreferencesStore } = await import("@/store/preferences");
      usePreferencesStore.getState().setNotify({ thumbnails: false });
      expect(usePreferencesStore.getState().notify.thumbnails).toBe(false);
      expect(localStorage.setItem).toHaveBeenLastCalledWith(
        "zcrypt-notify-prefs",
        JSON.stringify({ thumbnails: false }),
      );
    });
  });
});
