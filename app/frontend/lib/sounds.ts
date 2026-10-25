import {
  usePreferencesStore,
  type SoundArea,
  type SoundPrefs,
  type SoundSet,
} from "@/store/preferences";
import { isTauri } from "@/lib/tauri";

export type SoundEvent = "done" | "headsUp" | "problem";

export const SOUND_EVENTS: readonly SoundEvent[] = ["done", "headsUp", "problem"];

type Tone = (freq: number, at: number, dur: number, type?: OscillatorType, gain?: number) => void;

const SYNTH: Record<SoundSet, Record<SoundEvent, (tone: Tone) => void>> = {
  soft: {
    done: (tone) => {
      tone(523, 0, 0.22);
      tone(784, 0.11, 0.32);
    },
    headsUp: (tone) => {
      tone(784, 0, 0.22);
      tone(523, 0.11, 0.34);
    },
    problem: (tone) => {
      tone(330, 0, 0.14, "triangle", 0.3);
      tone(330, 0.19, 0.22, "triangle", 0.3);
    },
  },
  glass: {
    done: (tone) => {
      tone(1047, 0, 0.35, "sine", 0.18);
      tone(1568, 0.07, 0.5, "sine", 0.14);
      tone(2093, 0.14, 0.6, "sine", 0.08);
    },
    headsUp: (tone) => {
      tone(1568, 0, 0.35, "sine", 0.16);
      tone(1047, 0.08, 0.55, "sine", 0.14);
    },
    problem: (tone) => {
      tone(1319, 0, 0.18, "sine", 0.22);
      tone(1319, 0.22, 0.3, "sine", 0.22);
    },
  },
  minimal: {
    done: (tone) => tone(1200, 0, 0.08, "square", 0.12),
    headsUp: (tone) => tone(700, 0, 0.09, "square", 0.12),
    problem: (tone) => {
      tone(900, 0, 0.06, "square", 0.14);
      tone(900, 0.12, 0.08, "square", 0.14);
    },
  },
};

const VIBRATION: Record<SoundEvent, number[]> = {
  done: [30],
  headsUp: [20, 60, 20],
  problem: [60, 40, 60],
};

let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor();
  return ctx;
}

/** Create and resume the audio context. Browsers only allow this from a user gesture. */
export function unlockAudio(): void {
  try {
    void context()?.resume();
  } catch {
    // audio unavailable: sounds stay silent
  }
}

/** Drop the audio context so the next cue creates a fresh one. */
export function releaseAudio(): void {
  void ctx?.close?.();
  ctx = null;
}

/** Unlock audio on the first tap or key press. Returns a cleanup function. */
export function installAudioUnlock(): () => void {
  const events = ["pointerdown", "keydown", "touchstart"] as const;
  const off = () => events.forEach((e) => window.removeEventListener(e, onGesture, true));
  function onGesture() {
    unlockAudio();
    off();
  }
  events.forEach((e) => window.addEventListener(e, onGesture, true));
  return off;
}

function synthesize(set: SoundSet, event: SoundEvent): void {
  const ac = context();
  if (!ac) return;
  const tone: Tone = (freq, at, dur, type = "sine", gain = 0.25) => {
    const osc = ac.createOscillator();
    const vol = ac.createGain();
    const t0 = ac.currentTime + at;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    vol.gain.setValueAtTime(0, t0);
    vol.gain.linearRampToValueAtTime(gain, t0 + 0.012);
    vol.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
    osc.connect(vol).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  };
  SYNTH[set][event](tone);
}

/** True while the person is not looking at the app. */
export function isInBackground(): boolean {
  return document.hidden || !document.hasFocus();
}

/** The pure gate: should this cue make any noise given the saved choices? */
export function shouldPlay(prefs: SoundPrefs, area: SoundArea, background: boolean): boolean {
  if (!prefs.enabled || !prefs.areas[area]) return false;
  return !prefs.backgroundOnly || background;
}

function canVibrate(): boolean {
  if (typeof navigator.vibrate !== "function") return false;
  const android = /Android/i.test(navigator.userAgent);
  if (isTauri && !android) return false;
  return navigator.maxTouchPoints > 0;
}

/** Play the cue for an event if the saved choices allow it, and buzz on touch devices. */
export function playSound(event: SoundEvent, area: SoundArea): void {
  if (typeof window === "undefined") return;
  const prefs = usePreferencesStore.getState().sound;
  if (!shouldPlay(prefs, area, isInBackground())) return;
  try {
    synthesize(prefs.set, event);
    if (prefs.vibrate && canVibrate()) navigator.vibrate(VIBRATION[event]);
  } catch {
    // a blocked audio context must never break the action that triggered it
  }
}

/** Play a cue regardless of the gates, for the Preview buttons in Settings. */
export function previewSound(event: SoundEvent, set?: SoundSet): void {
  unlockAudio();
  try {
    synthesize(set ?? usePreferencesStore.getState().sound.set, event);
  } catch {
    // audio unavailable
  }
}
