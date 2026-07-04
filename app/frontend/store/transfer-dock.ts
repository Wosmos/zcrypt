import { create } from "zustand";

// Bridges the docked <TransferManager /> and the mobile <VaultFab />, which
// both anchor to the bottom-right and would otherwise overlap. The dock reports
// whether it's showing and how tall it currently is (collapsed vs expanded, and
// item count all change this); the FAB reads that to hop up and clear it.
interface TransferDockStore {
  visible: boolean;
  height: number;
  report: (visible: boolean, height: number) => void;
}

export const useTransferDockStore = create<TransferDockStore>((set) => ({
  visible: false,
  height: 0,
  report: (visible, height) =>
    set((s) =>
      s.visible === visible && s.height === height ? s : { visible, height }
    ),
}));
