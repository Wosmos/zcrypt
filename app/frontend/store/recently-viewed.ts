import { create } from "zustand";

export interface RecentlyViewedEntry {
  fileId: string;
  viewedAt: number;
}

interface RecentlyViewedStore {
  entries: RecentlyViewedEntry[];
  logView: (fileId: string) => void;
}

const STORAGE_KEY = "zcrypt-recently-viewed";
const MAX_ENTRIES = 20;

function isEntry(v: unknown): v is RecentlyViewedEntry {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as RecentlyViewedEntry).fileId === "string" &&
    typeof (v as RecentlyViewedEntry).viewedAt === "number"
  );
}

function load(): RecentlyViewedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isEntry) : [];
  } catch {
    return [];
  }
}

function persist(entries: RecentlyViewedEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage full/unavailable: keep serving from the in-memory state.
  }
}

export const useRecentlyViewedStore = create<RecentlyViewedStore>((set, get) => ({
  entries: load(),

  logView: (fileId) => {
    const next = [
      { fileId, viewedAt: Date.now() },
      ...get().entries.filter((e) => e.fileId !== fileId),
    ].slice(0, MAX_ENTRIES);
    persist(next);
    set({ entries: next });
  },
}));
