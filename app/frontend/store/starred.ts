import { useEffect } from "react";
import { create } from "zustand";
import { useAuthStore } from "@/store/auth";

const KEY_PREFIX = "zcrypt-starred:";

interface StarredStore {
  userId: string | null;
  ids: string[];
  sync: (userId: string | null) => void;
  toggle: (fileId: string) => void;
}

function load(userId: string | null): string[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY_PREFIX + userId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function persist(userId: string, ids: string[]) {
  try {
    localStorage.setItem(KEY_PREFIX + userId, JSON.stringify(ids));
  } catch {
    // Storage full/unavailable: keep serving from the in-memory state.
  }
}

export const useStarredStore = create<StarredStore>((set, get) => ({
  userId: null,
  ids: [],

  sync: (userId) => {
    if (get().userId === userId) return;
    set({ userId, ids: load(userId) });
  },

  toggle: (fileId) => {
    const userId = useAuthStore.getState().user?.id ?? null;
    get().sync(userId);
    if (!userId) return;
    const current = get().ids;
    const next = current.includes(fileId)
      ? current.filter((id) => id !== fileId)
      : [fileId, ...current];
    persist(userId, next);
    set({ ids: next });
  },
}));

export function useStarredSync() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  useEffect(() => {
    useStarredStore.getState().sync(userId);
  }, [userId]);
}

export function useIsStarred(fileId: string): boolean {
  return useStarredStore((s) => s.ids.includes(fileId));
}
