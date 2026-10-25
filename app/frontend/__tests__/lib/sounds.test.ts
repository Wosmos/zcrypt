import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as sounds from "@/lib/sounds";
import { DEFAULT_SOUND_PREFS, usePreferencesStore, type SoundPrefs } from "@/store/preferences";

const tauri = vi.hoisted(() => ({ isTauri: false }));
vi.mock("@/lib/tauri", () => ({
  get isTauri() {
    return tauri.isTauri;
  },
}));

interface FakeNode {
  connect: ReturnType<typeof vi.fn>;
}

function makeContext(opts: { throwOnOscillator?: boolean; throwOnResume?: boolean } = {}) {
  const oscillators: Array<{ type: string; frequency: { setValueAtTime: ReturnType<typeof vi.fn> } }> = [];
  const gains: Array<{ gain: { linearRampToValueAtTime: ReturnType<typeof vi.fn> } }> = [];
  const ctx = {
    currentTime: 10,
    destination: {},
    close: vi.fn(),
    resume: vi.fn(() => {
      if (opts.throwOnResume) throw new Error("no resume");
      return Promise.resolve();
    }),
    createOscillator: vi.fn(() => {
      if (opts.throwOnOscillator) throw new Error("no audio");
      const node = {
        type: "",
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn((next: FakeNode) => next),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(node);
      return node;
    }),
    createGain: vi.fn(() => {
      const node = {
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn((next: unknown) => next),
      };
      gains.push(node);
      return node;
    }),
  };
  return { ctx, oscillators, gains };
}

function install(opts?: Parameters<typeof makeContext>[0], key: "AudioContext" | "webkitAudioContext" = "AudioContext") {
  const made = makeContext(opts);
  const Ctor = vi.fn(function () {
    return made.ctx;
  });
  vi.stubGlobal("AudioContext", undefined);
  (window as unknown as Record<string, unknown>).AudioContext = undefined;
  (window as unknown as Record<string, unknown>).webkitAudioContext = undefined;
  (window as unknown as Record<string, unknown>)[key] = Ctor;
  return { ...made, Ctor };
}

async function load() {
  sounds.releaseAudio();
  return { ...sounds, usePreferencesStore };
}

function setSound(
  usePreferencesStore: Awaited<ReturnType<typeof load>>["usePreferencesStore"],
  patch: Partial<SoundPrefs>,
) {
  usePreferencesStore.setState({ sound: { ...DEFAULT_SOUND_PREFS, ...patch } });
}

function setBackground(hidden: boolean, focused: boolean) {
  Object.defineProperty(document, "hidden", { value: hidden, configurable: true });
  vi.spyOn(document, "hasFocus").mockReturnValue(focused);
}

describe("shouldPlay", () => {
  it("is silent when the master switch or the area is off", async () => {
    const { shouldPlay } = await load();
    expect(shouldPlay({ ...DEFAULT_SOUND_PREFS, enabled: false }, "transfers", true)).toBe(false);
    const areas = { ...DEFAULT_SOUND_PREFS.areas, sharing: false };
    expect(shouldPlay({ ...DEFAULT_SOUND_PREFS, areas }, "sharing", true)).toBe(false);
    expect(shouldPlay({ ...DEFAULT_SOUND_PREFS, areas }, "transfers", true)).toBe(true);
  });

  it("waits for the background when background only is on", async () => {
    const { shouldPlay } = await load();
    expect(shouldPlay(DEFAULT_SOUND_PREFS, "transfers", false)).toBe(false);
    expect(shouldPlay(DEFAULT_SOUND_PREFS, "transfers", true)).toBe(true);
    expect(shouldPlay({ ...DEFAULT_SOUND_PREFS, backgroundOnly: false }, "transfers", false)).toBe(true);
  });
});

describe("isInBackground", () => {
  afterEach(() => vi.restoreAllMocks());

  it("is true when the tab is hidden or the window is blurred", async () => {
    const { isInBackground } = await load();
    setBackground(true, true);
    expect(isInBackground()).toBe(true);
    setBackground(false, false);
    expect(isInBackground()).toBe(true);
    setBackground(false, true);
    expect(isInBackground()).toBe(false);
  });
});

describe("playSound", () => {
  beforeEach(() => {
    tauri.isTauri = false;
    setBackground(true, false);
    Object.defineProperty(navigator, "vibrate", { value: vi.fn(), configurable: true });
    Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("plays the soft done cue with the exact notes and buzzes on touch", async () => {
    const { oscillators, gains } = install();
    const { playSound, usePreferencesStore } = await load();
    setSound(usePreferencesStore, {});
    playSound("done", "transfers");
    expect(oscillators.map((o) => o.frequency.setValueAtTime.mock.calls[0][0])).toEqual([523, 784]);
    expect(oscillators.every((o) => o.type === "sine")).toBe(true);
    expect(gains[0].gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.25, 10.012);
    expect(navigator.vibrate).toHaveBeenCalledWith([30]);
  });

  it("uses each set's own definitions", async () => {
    const { oscillators } = install();
    const { playSound, usePreferencesStore } = await load();
    const notes = () => oscillators.splice(0).map((o) => [o.frequency.setValueAtTime.mock.calls[0][0], o.type]);

    setSound(usePreferencesStore, { set: "soft" });
    playSound("headsUp", "transfers");
    expect(notes()).toEqual([[784, "sine"], [523, "sine"]]);
    playSound("problem", "problems");
    expect(notes()).toEqual([[330, "triangle"], [330, "triangle"]]);

    setSound(usePreferencesStore, { set: "glass" });
    playSound("done", "transfers");
    expect(notes()).toEqual([[1047, "sine"], [1568, "sine"], [2093, "sine"]]);
    playSound("headsUp", "transfers");
    expect(notes()).toEqual([[1568, "sine"], [1047, "sine"]]);
    playSound("problem", "problems");
    expect(notes()).toEqual([[1319, "sine"], [1319, "sine"]]);

    setSound(usePreferencesStore, { set: "minimal" });
    playSound("done", "transfers");
    expect(notes()).toEqual([[1200, "square"]]);
    playSound("headsUp", "transfers");
    expect(notes()).toEqual([[700, "square"]]);
    playSound("problem", "problems");
    expect(notes()).toEqual([[900, "square"], [900, "square"]]);
  });

  it("stays silent while the app is focused and in the foreground", async () => {
    const { oscillators } = install();
    const { playSound, usePreferencesStore } = await load();
    setSound(usePreferencesStore, {});
    setBackground(false, true);
    playSound("done", "transfers");
    expect(oscillators).toHaveLength(0);
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it("plays in the foreground when background only is off", async () => {
    const { oscillators } = install();
    const { playSound, usePreferencesStore } = await load();
    setSound(usePreferencesStore, { backgroundOnly: false });
    setBackground(false, true);
    playSound("done", "transfers");
    expect(oscillators).toHaveLength(2);
  });

  it("respects the master switch and the area switch", async () => {
    const { oscillators } = install();
    const { playSound, usePreferencesStore } = await load();
    setSound(usePreferencesStore, { enabled: false });
    playSound("done", "transfers");
    setSound(usePreferencesStore, { areas: { ...DEFAULT_SOUND_PREFS.areas, security: false } });
    playSound("headsUp", "security");
    expect(oscillators).toHaveLength(0);
  });

  it("skips the buzz when vibrate is off, unsupported, or there is no touch", async () => {
    install();
    const { playSound, usePreferencesStore } = await load();
    setSound(usePreferencesStore, { vibrate: false });
    playSound("done", "transfers");
    setSound(usePreferencesStore, {});
    Object.defineProperty(navigator, "maxTouchPoints", { value: 0, configurable: true });
    playSound("done", "transfers");
    Object.defineProperty(navigator, "vibrate", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "maxTouchPoints", { value: 5, configurable: true });
    playSound("done", "transfers");
    expect(vi.isMockFunction(navigator.vibrate)).toBe(false);
  });

  it("skips the buzz on the Tauri desktop app but keeps it on Android", async () => {
    install();
    const vibrate = vi.fn();
    Object.defineProperty(navigator, "vibrate", { value: vibrate, configurable: true });
    const { playSound, usePreferencesStore } = await load();
    setSound(usePreferencesStore, {});
    tauri.isTauri = true;
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Macintosh)");
    playSound("done", "transfers");
    expect(vibrate).not.toHaveBeenCalled();
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (Linux; Android 15)");
    playSound("problem", "problems");
    expect(vibrate).toHaveBeenCalledWith([60, 40, 60]);
  });

  it("uses the prefixed AudioContext when the standard one is missing", async () => {
    const { Ctor } = install(undefined, "webkitAudioContext");
    const { playSound, usePreferencesStore } = await load();
    setSound(usePreferencesStore, {});
    playSound("done", "transfers");
    expect(Ctor).toHaveBeenCalledOnce();
  });

  it("reuses one AudioContext across cues", async () => {
    const { Ctor } = install();
    const { playSound, usePreferencesStore } = await load();
    setSound(usePreferencesStore, {});
    playSound("done", "transfers");
    playSound("done", "transfers");
    expect(Ctor).toHaveBeenCalledOnce();
  });

  it("does nothing when the browser has no Web Audio", async () => {
    install();
    (window as unknown as Record<string, unknown>).AudioContext = undefined;
    const { playSound, usePreferencesStore } = await load();
    setSound(usePreferencesStore, {});
    expect(() => playSound("done", "transfers")).not.toThrow();
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it("never throws when audio is blocked", async () => {
    install({ throwOnOscillator: true });
    const { playSound, usePreferencesStore } = await load();
    setSound(usePreferencesStore, {});
    expect(() => playSound("done", "transfers")).not.toThrow();
  });

  it("does nothing during server rendering", async () => {
    const { playSound } = await load();
    vi.stubGlobal("window", undefined);
    expect(() => playSound("done", "transfers")).not.toThrow();
  });
});

describe("unlockAudio and installAudioUnlock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates and resumes the context", async () => {
    const { ctx, Ctor } = install();
    const { unlockAudio } = await load();
    unlockAudio();
    expect(Ctor).toHaveBeenCalledOnce();
    expect(ctx.resume).toHaveBeenCalledOnce();
  });

  it("tolerates a missing Web Audio and a failing resume", async () => {
    install({ throwOnResume: true });
    const { unlockAudio } = await load();
    expect(() => unlockAudio()).not.toThrow();
    (window as unknown as Record<string, unknown>).AudioContext = undefined;
    const fresh = await load();
    expect(() => fresh.unlockAudio()).not.toThrow();
  });

  it("unlocks once on the first gesture and then stops listening", async () => {
    const { ctx } = install();
    const { installAudioUnlock } = await load();
    installAudioUnlock();
    window.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new Event("keydown"));
    expect(ctx.resume).toHaveBeenCalledOnce();
  });

  it("can be cleaned up before any gesture", async () => {
    const { ctx } = install();
    const { installAudioUnlock } = await load();
    const off = installAudioUnlock();
    off();
    window.dispatchEvent(new Event("pointerdown"));
    expect(ctx.resume).not.toHaveBeenCalled();
  });
});

describe("previewSound", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("plays regardless of the gates, with the saved set by default", async () => {
    const { oscillators, ctx } = install();
    const { previewSound, usePreferencesStore } = await load();
    setSound(usePreferencesStore, { enabled: false, set: "minimal" });
    previewSound("done");
    expect(ctx.resume).toHaveBeenCalled();
    expect(oscillators.map((o) => o.type)).toEqual(["square"]);
  });

  it("can preview a set other than the saved one", async () => {
    const { oscillators } = install();
    const { previewSound } = await load();
    previewSound("problem", "glass");
    expect(oscillators).toHaveLength(2);
    expect(oscillators[0].frequency.setValueAtTime.mock.calls[0][0]).toBe(1319);
  });

  it("never throws when audio is blocked", async () => {
    install({ throwOnOscillator: true });
    const { previewSound } = await load();
    expect(() => previewSound("done")).not.toThrow();
  });
});

describe("releaseAudio", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("closes the context and tolerates having none", () => {
    sounds.releaseAudio();
    const { ctx } = install();
    sounds.unlockAudio();
    sounds.releaseAudio();
    expect(ctx.close).toHaveBeenCalledOnce();
    sounds.releaseAudio();
  });

  it("copes with a context that cannot close", () => {
    const { ctx } = install();
    sounds.unlockAudio();
    (ctx as { close?: unknown }).close = undefined;
    expect(() => sounds.releaseAudio()).not.toThrow();
  });
});
