import { create } from "zustand";

/** Where things dropped on the transfer panel go: set by the page that owns the
 *  upload and download actions (the vault), cleared when it unmounts. */
export interface TransferDropTarget {
  /** Name of the folder an upload dropped now would land in. */
  folderName: string;
  upload: (files: File[]) => void;
  download: (fileIds: string[]) => void;
}

// Bridges the docked <TransferManager /> and the mobile <VaultFab />, which
// both anchor to the bottom-right and would otherwise overlap. The dock reports
// whether it's showing and how tall it currently is (collapsed vs expanded, and
// item count all change this); the FAB reads that to hop up and clear it.
interface TransferDockStore {
  visible: boolean;
  height: number;
  report: (visible: boolean, height: number) => void;
  dropTarget: TransferDropTarget | null;
  setDropTarget: (target: TransferDropTarget | null) => void;
  /** Decrypted names of folders uploads were sent to, so rows can say "Saved to Family". */
  folderNames: Record<string, string>;
  rememberFolder: (id: string, name: string) => void;
  /** Highest bar each transfer row has shown, so a row's bar never moves backwards. */
  bars: Record<string, number>;
  /** Keep the higher of old and new per key; keys missing from `next` are dropped. */
  recordBars: (next: Record<string, number>) => void;
}

export const useTransferDockStore = create<TransferDockStore>((set) => ({
  visible: false,
  height: 0,
  report: (visible, height) =>
    set((s) => (s.visible === visible && s.height === height ? s : { visible, height })),
  dropTarget: null,
  setDropTarget: (dropTarget) => set({ dropTarget }),
  folderNames: {},
  rememberFolder: (id, name) =>
    set((s) =>
      s.folderNames[id] === name ? s : { folderNames: { ...s.folderNames, [id]: name } },
    ),
  bars: {},
  recordBars: (next) =>
    set((s) => {
      const merged: Record<string, number> = {};
      for (const [k, v] of Object.entries(next)) merged[k] = Math.max(v, s.bars[k] ?? 0);
      const keys = Object.keys(merged);
      const same =
        keys.length === Object.keys(s.bars).length && keys.every((k) => s.bars[k] === merged[k]);
      return same ? s : { bars: merged };
    }),
}));
