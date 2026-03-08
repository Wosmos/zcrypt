import { create } from "zustand";
import type { AuthUser } from "@/types";

interface AuthStore {
  user: AuthUser | null;
  accessToken: string | null;
  refreshTokenValue: string | null;
  loading: boolean;
  initialized: boolean;

  setUser: (user: AuthUser | null) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  accessToken:
    typeof window !== "undefined"
      ? localStorage.getItem("zpush-access-token")
      : null,
  refreshTokenValue:
    typeof window !== "undefined"
      ? localStorage.getItem("zpush-refresh-token")
      : null,
  loading: false,
  initialized: false,

  setUser: (user) => set({ user }),

  setTokens: (accessToken, refreshToken) => {
    localStorage.setItem("zpush-access-token", accessToken);
    localStorage.setItem("zpush-refresh-token", refreshToken);
    set({ accessToken, refreshTokenValue: refreshToken });
  },

  setLoading: (loading) => set({ loading }),
  setInitialized: (initialized) => set({ initialized }),

  clearAuth: () => {
    localStorage.removeItem("zpush-access-token");
    localStorage.removeItem("zpush-refresh-token");
    set({ user: null, accessToken: null, refreshTokenValue: null });
  },
}));
