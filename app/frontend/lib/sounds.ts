import {
  usePreferencesStore,
  type SoundArea,
  type SoundPrefs,
  type SoundSet,
} from "@/store/preferences";
import { isTauri } from "@/lib/tauri";

export type SoundEvent = "done" | "headsUp" | "problem";

export const SOUND_EVENTS: readonly SoundEvent[] = ["done", "headsUp", "problem"];

/** One struck note: a fundamental plus optional partials, detuned layer, pitch glide and filter sweep. */
export interface Note {
  freq: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  gain: number;
  attack: number;
  /** Extra oscillators at these frequency ratios, each quieter than the last: harmonic for wood, inharmonic for bells. */
  partials?: number[];
  /** A second copy of every oscillator this many cents off, for width. */
  detune?: number;
  /** Where the pitch ends, as a ratio of `freq`, after sixty percent of the note. */
  glide?: number;
  /** Low-pass cutoff at the strike; it falls to a quarter of this by the end of the note. */
  cutoff?: number;
}

const soft = (freq: number, at: number, dur: number, gain = 0.22): Note => ({
  freq,
  at,
  dur,
  gain,
  type: "triangle",
  attack: 0.006,
  partials: [2, 3.9],
  detune: 6,
  cutoff: 2600,
});
const glass = (freq: number, at: number, dur: number, gain = 0.14): Note => ({
  freq,
  at,
  dur,
  gain,
  attack: 0.015,
  partials: [2.76, 5.4],
  detune: 3,
});
const tick = (freq: number, at: number, dur: number, gain = 0.18, glide = 0.55): Note => ({
  freq,
  at,
  dur,
  gain,
  attack: 0.003,
  glide,
});

/** The notes behind every set and event. Exported so Settings previews and tests share one source. */
export const SOUND_SETS: Record<SoundSet, Record<SoundEvent, readonly Note[]>> = {
  soft: {
    done: [soft(523, 0, 0.38), soft(659, 0.09, 0.4), soft(784, 0.18, 0.62, 0.2)],
    headsUp: [soft(659, 0, 0.34), soft(523, 0.13, 0.55)],
    problem: [soft(262, 0, 0.2, 0.3), soft(247, 0.21, 0.4, 0.3)],
  },
  glass: {
    done: [glass(1047, 0, 0.8), glass(1319, 0.09, 0.9), glass(1760, 0.18, 1.2, 0.1)],
    headsUp: [glass(1568, 0, 0.7), glass(1175, 0.11, 1.0)],
    problem: [glass(988, 0, 0.28, 0.18), glass(988, 0.27, 0.5, 0.18)],
  },
  minimal: {
    done: [tick(1400, 0, 0.09), tick(2100, 0.08, 0.07, 0.12, 0.8)],
    headsUp: [tick(900, 0, 0.1, 0.18, 0.7)],
    problem: [tick(500, 0, 0.09, 0.22), tick(500, 0.14, 0.12, 0.22)],
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

function strike(ac: AudioContext, note: Note): void {
  const t0 = ac.currentTime + note.at;
  const end = t0 + note.dur;
  const out = ac.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(note.gain, t0 + note.attack);
  out.gain.exponentialRampToValueAtTime(0.0006, end);
  let head: AudioNode = out;
  if (note.cutoff) {
    const filter = ac.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(note.cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(note.cutoff / 4, end);
    filter.connect(out);
    head = filter;
  }
  out.connect(ac.destination);
  const ratios = [1, ...(note.partials ?? [])];
  const offsets = note.detune ? [0, note.detune] : [0];
  ratios.forEach((ratio, i) => {
    for (const cents of offsets) {
      const osc = ac.createOscillator();
      const level = ac.createGain();
      osc.type = note.type ?? "sine";
      const freq = note.freq * ratio;
      osc.frequency.setValueAtTime(freq, t0);
      if (note.glide)
        osc.frequency.exponentialRampToValueAtTime(freq * note.glide, t0 + note.dur * 0.6);
      osc.detune.setValueAtTime(cents, t0);
      level.gain.setValueAtTime(1 / (i + 1) ** 1.6 / offsets.length, t0);
      osc.connect(level).connect(head);
      osc.start(t0);
      osc.stop(end + 0.05);
    }
  });
}

function synthesize(set: SoundSet, event: SoundEvent): void {
  const ac = context();
  if (!ac) return;
  for (const note of SOUND_SETS[set][event]) strike(ac, note);
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
