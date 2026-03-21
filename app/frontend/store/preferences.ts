import { create } from "zustand";

interface PreferencesStore {
  advancedMode: boolean;
  setAdvancedMode: (enabled: boolean) => void;
}

export const usePreferencesStore = create<PreferencesStore>((set) => ({
  advancedMode:
    typeof window !== "undefined"
      ? localStorage.getItem("zcrypt-advanced-mode") === "true"
      : false,

  setAdvancedMode: (enabled) => {
    localStorage.setItem("zcrypt-advanced-mode", String(enabled));
    set({ advancedMode: enabled });
  },
}));
