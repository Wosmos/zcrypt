import { create } from "zustand";
import { onDecryptCacheClear, onDecryptFolderClear } from "@/lib/decrypt-cache";
import type { FileMetadata } from "@/types";

export type DecryptMedia = (file: FileMetadata) => Promise<Blob>;

/**
 * Media that keeps playing after its viewer closes: the mini player.
 *
 * The store OWNS `src`, a blob URL over decrypted plaintext. It is revoked the
 * moment it stops being played: on close, on a track switch, and on every
 * vault lock, TTL expiry, folder re-lock or logout (via the decrypt-cache
 * clear events), so a minimized player can never outlive the unlock that
 * produced its plaintext.
 */
interface NowPlayingState {
  /** The queue being played: the media files of the folder it started in. */
  queue: FileMetadata[];
  position: number;
  src: string | null;
  /** Where to resume when `src` first loads, in seconds. */
  startAt: number;
  autoplay: boolean;
  loading: boolean;
  error: boolean;
  decrypt: DecryptMedia | null;
  /** On-screen height of the mini player, so other bottom-anchored UI (the
   *  mobile action button, toasts) can sit clear of it. 0 when hidden. */
  height: number;
  reportHeight: (height: number) => void;
  /** Hand a decrypted, already-playing track to the mini player. Takes
   *  ownership of `src`. */
  start: (args: {
    queue: FileMetadata[];
    position: number;
    src: string;
    startAt: number;
    autoplay: boolean;
    decrypt: DecryptMedia;
  }) => void;
  /** Decrypt and play another queue entry, keeping playback going. */
  playAt: (position: number) => Promise<void>;
  close: () => void;
}

// Bumped by every start/close/playAt so a slow decrypt that finishes after the
// player moved on revokes its own URL instead of resurrecting stale playback.
let generation = 0;

const EMPTY = {
  queue: [] as FileMetadata[],
  position: 0,
  src: null,
  startAt: 0,
  autoplay: false,
  loading: false,
  error: false,
  decrypt: null,
  height: 0,
};

export const useNowPlaying = create<NowPlayingState>((set, get) => ({
  ...EMPTY,

  reportHeight: (height) => set((s) => (s.height === height ? s : { height })),

  start: ({ queue, position, src, startAt, autoplay, decrypt }) => {
    generation++;
    const previous = get().src;
    if (previous && previous !== src) URL.revokeObjectURL(previous);
    set({ queue, position, src, startAt, autoplay, decrypt, loading: false, error: false });
  },

  playAt: async (position) => {
    const { queue, decrypt } = get();
    const file = queue[position];
    if (!file || !decrypt) return;
    const run = ++generation;
    set({ position, loading: true, error: false });
    try {
      const blob = await decrypt(file);
      const url = URL.createObjectURL(blob);
      if (run !== generation) {
        URL.revokeObjectURL(url);
        return;
      }
      const previous = get().src;
      if (previous) URL.revokeObjectURL(previous);
      set({ src: url, startAt: 0, autoplay: true, loading: false });
    } catch {
      if (run === generation) set({ loading: false, error: true });
    }
  },

  close: () => {
    generation++;
    const { src } = get();
    if (src) URL.revokeObjectURL(src);
    set({ ...EMPTY });
  },
}));

/** The queue entry being played, or null when nothing is. */
export function currentTrack(state: Pick<NowPlayingState, "queue" | "position" | "src">) {
  return state.src ? (state.queue[state.position] ?? null) : null;
}

onDecryptCacheClear(() => useNowPlaying.getState().close());
onDecryptFolderClear((folderId) => {
  const track = currentTrack(useNowPlaying.getState());
  if (track && track.folder_id === folderId) useNowPlaying.getState().close();
});
