import { create } from "zustand";

export type SoundSet = "soft" | "glass" | "minimal";
export type SoundArea = "transfers" | "sharing" | "security" | "problems";

export const SOUND_SETS: readonly SoundSet[] = ["soft", "glass", "minimal"];
export const SOUND_AREAS: readonly SoundArea[] = ["transfers", "sharing", "security", "problems"];

/** The per-device sound and vibration choices. */
export interface SoundPrefs {
  enabled: boolean;
  set: SoundSet;
  areas: Record<SoundArea, boolean>;
  vibrate: boolean;
  backgroundOnly: boolean;
}

export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  enabled: true,
  set: "soft",
  areas: { transfers: true, sharing: true, security: true, problems: true },
  vibrate: true,
  backgroundOnly: true,
};

const SOUND_KEY = "zcrypt-sound-prefs";

/** Read the saved sound choices, filling anything missing or invalid with defaults. */
export function loadSoundPrefs(): SoundPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(SOUND_KEY) ?? "null") as Partial<SoundPrefs> | null;
    if (!raw || typeof raw !== "object") return DEFAULT_SOUND_PREFS;
    const areas = { ...DEFAULT_SOUND_PREFS.areas };
    for (const a of SOUND_AREAS) {
      if (typeof raw.areas?.[a] === "boolean") areas[a] = raw.areas[a];
    }
    return {
      enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_SOUND_PREFS.enabled,
      set: SOUND_SETS.includes(raw.set as SoundSet)
        ? (raw.set as SoundSet)
        : DEFAULT_SOUND_PREFS.set,
      areas,
      vibrate: typeof raw.vibrate === "boolean" ? raw.vibrate : DEFAULT_SOUND_PREFS.vibrate,
      backgroundOnly:
        typeof raw.backgroundOnly === "boolean"
          ? raw.backgroundOnly
          : DEFAULT_SOUND_PREFS.backgroundOnly,
    };
  } catch {
    return DEFAULT_SOUND_PREFS;
  }
}

/** Per-device choices for operating system notifications. */
export interface NotifyPrefs {
  /** Attach the photo preview to transfer notifications. */
  thumbnails: boolean;
}

export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { thumbnails: true };

const NOTIFY_KEY = "zcrypt-notify-prefs";

/** Read the saved notification choices, falling back to defaults. */
export function loadNotifyPrefs(): NotifyPrefs {
  try {
    const raw = JSON.parse(
      localStorage.getItem(NOTIFY_KEY) ?? "null",
    ) as Partial<NotifyPrefs> | null;
    const thumbnails = raw?.thumbnails;
    return {
      thumbnails: typeof thumbnails === "boolean" ? thumbnails : DEFAULT_NOTIFY_PREFS.thumbnails,
    };
  } catch {
    return DEFAULT_NOTIFY_PREFS;
  }
}

interface PreferencesStore {
  advancedMode: boolean;
  setAdvancedMode: (enabled: boolean) => void;
  sound: SoundPrefs;
  setSound: (patch: Partial<Omit<SoundPrefs, "areas">>) => void;
  setSoundArea: (area: SoundArea, on: boolean) => void;
  notify: NotifyPrefs;
  setNotify: (patch: Partial<NotifyPrefs>) => void;
}

function save(key: string, value: SoundPrefs | NotifyPrefs) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage blocked: the choice still applies for this session
  }
}

export const usePreferencesStore = create<PreferencesStore>((set, get) => ({
  advancedMode:
    typeof window !== "undefined" ? localStorage.getItem("zcrypt-advanced-mode") === "true" : false,

  setAdvancedMode: (enabled) => {
    localStorage.setItem("zcrypt-advanced-mode", String(enabled));
    set({ advancedMode: enabled });
  },

  sound: typeof window !== "undefined" ? loadSoundPrefs() : DEFAULT_SOUND_PREFS,

  setSound: (patch) => {
    const sound = { ...get().sound, ...patch };
    save(SOUND_KEY, sound);
    set({ sound });
  },

  setSoundArea: (area, on) => {
    const current = get().sound;
    const sound = { ...current, areas: { ...current.areas, [area]: on } };
    save(SOUND_KEY, sound);
    set({ sound });
  },

  notify: typeof window !== "undefined" ? loadNotifyPrefs() : DEFAULT_NOTIFY_PREFS,

  setNotify: (patch) => {
    const notify = { ...get().notify, ...patch };
    save(NOTIFY_KEY, notify);
    set({ notify });
  },
}));
