import { create } from "zustand";

export type DashboardAction = "upload" | "newFolder" | "shortcuts";

interface PendingActionStore {
  pending: DashboardAction | null;
  request: (action: DashboardAction) => void;
  clear: () => void;
}

export const usePendingAction = create<PendingActionStore>((set) => ({
  pending: null,
  request: (pending) => set({ pending }),
  clear: () => set({ pending: null }),
}));
