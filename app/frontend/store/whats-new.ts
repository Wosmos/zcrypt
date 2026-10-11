import { create } from "zustand";

interface WhatsNewState {
  open: boolean;
  version: string | null;
  seen: string | null;
  init: (version: string, seen: string | null) => void;
  setOpen: (open: boolean) => void;
  markSeen: () => void;
}

export const useWhatsNewStore = create<WhatsNewState>((set, get) => ({
  open: false,
  version: null,
  seen: null,
  init: (version, seen) => set({ version, seen }),
  setOpen: (open) => set({ open }),
  markSeen: () => set({ seen: get().version }),
}));

export const selectWhatsNewUnread = (s: WhatsNewState): boolean =>
  s.version !== null && s.seen !== null && s.seen !== s.version;
