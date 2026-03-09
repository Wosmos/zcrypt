"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { getMe } from "@/lib/auth-api";
import { refreshToken as refreshTokenApi } from "@/lib/auth-api";
import { listFiles } from "@/lib/api";
import { useFileStore } from "@/store/files";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const {
    user,
    accessToken,
    refreshTokenValue,
    initialized,
    setUser,
    setTokens,
    setInitialized,
    clearAuth,
  } = useAuthStore();

  useEffect(() => {
    if (initialized) return;

    async function init() {
      if (!accessToken && !refreshTokenValue) {
        setInitialized(true);
        router.replace("/login");
        return;
      }

      // Prefetch file list into store so dashboard loads instantly
      const prefetchFiles = () => {
        listFiles().then((data) => {
          useFileStore.getState().setFiles(data);
        }).catch(() => {});
      };

      // Try to fetch user with current access token
      if (accessToken) {
        try {
          const me = await getMe(accessToken);
          setUser(me);
          prefetchFiles();
          setInitialized(true);
          return;
        } catch {
          // Token might be expired, try refresh
        }
      }

      // Try refresh
      if (refreshTokenValue) {
        try {
          const data = await refreshTokenApi(refreshTokenValue);
          setTokens(data.access_token, data.refresh_token);
          const me = await getMe(data.access_token);
          setUser(me);
          prefetchFiles();
          setInitialized(true);
          return;
        } catch {
          // Refresh failed
        }
      }

      // All attempts failed
      clearAuth();
      setInitialized(true);
      router.replace("/login");
    }

    init();
  }, [initialized, accessToken, refreshTokenValue, router, setUser, setTokens, setInitialized, clearAuth]);

  if (!initialized) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
