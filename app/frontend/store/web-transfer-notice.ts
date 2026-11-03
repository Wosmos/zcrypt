import { create } from "zustand";
import type { WebTransferLimit } from "@/lib/web-transfer-limit";

/** A file the browser would not upload, as the dialog lists it. */
export interface RefusedFile {
  name: string;
  size: number;
}

/** What the "use the desktop app" dialog explains: one refusal and the files it held back. */
export interface WebTransferNotice extends WebTransferLimit {
  files: RefusedFile[];
}

interface WebTransferNoticeState {
  notice: WebTransferNotice | null;
  /** The upload batch the open notice belongs to, so its other refusals join it. */
  batch: string | null;
  /** Counts each newly opened notice, so the dialog starts fresh for every one. */
  seq: number;
  show: (limit: WebTransferLimit, file?: RefusedFile, batch?: string) => void;
  close: () => void;
}

const shownForBatch = new Set<string>();

function withFile(files: RefusedFile[], file: RefusedFile | undefined): RefusedFile[] {
  if (!file || files.some((f) => f.name === file.name && f.size === file.size)) return files;
  return [...files, file];
}

/**
 * The one dialog that explains a refused web upload. Refusals from the same
 * batch join the open dialog instead of stacking new ones, and once the user
 * has closed it, later refusals from that batch stay quiet: the transfer panel
 * still marks each file.
 */
export const useWebTransferNotice = create<WebTransferNoticeState>((set, get) => ({
  notice: null,
  batch: null,
  seq: 0,
  show: (limit, file, batch) => {
    const { notice, batch: openBatch } = get();
    const key = batch ? `${batch}:${limit.code}` : null;
    if (notice) {
      if (notice.code !== limit.code || openBatch !== (batch ?? null)) return;
      set({ notice: { ...notice, files: withFile(notice.files, file) } });
      return;
    }
    if (key && shownForBatch.has(key)) return;
    if (key) shownForBatch.add(key);
    set((state) => ({
      notice: { ...limit, files: file ? [file] : [] },
      batch: batch ?? null,
      seq: state.seq + 1,
    }));
  },
  close: () => set({ notice: null, batch: null }),
}));
