"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { getMe } from "@/lib/auth-api";
import { refreshToken as refreshTokenApi } from "@/lib/auth-api";
import { listFiles, getPlatformStatus } from "@/lib/api";
import { useFileStore } from "@/store/files";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { isTauri, startSync } from "@/lib/tauri";

export function AuthGuard({
  children,
  skipOnboardingCheck = false,
}: {
  children: React.ReactNode;
  skipOnboardingCheck?: boolean;
}) {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
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

      // Check if user needs onboarding — returns true if redirect needed
      const checkOnboarding = async (): Promise<boolean> => {
        if (skipOnboardingCheck) return false;
        try {
          const statuses = await getPlatformStatus();
          const hasConnected = statuses.some((s) => s.connected);
          if (!hasConnected) {
            setRedirecting(true);
            router.replace("/onboarding");
            return true;
          }
        } catch {
          // If check fails, let them through
        }
        return false;
      };

      // If user was already set by login/register page, skip the getMe call
      const existingUser = useAuthStore.getState().user;
      if (existingUser && accessToken) {
        const needsOnboarding = await checkOnboarding();
        if (!needsOnboarding) prefetchFiles();
        setInitialized(true);
        return;
      }

      // Try to fetch user with current access token
      if (accessToken) {
        try {
          const me = await getMe(accessToken);
          setUser(me);
          const needsOnboarding = await checkOnboarding();
          if (!needsOnboarding) prefetchFiles();
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
          const needsOnboarding = await checkOnboarding();
          if (!needsOnboarding) prefetchFiles();
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
  }, [initialized, accessToken, refreshTokenValue, router, skipOnboardingCheck, setUser, setTokens, setInitialized, clearAuth]);

  // Start desktop sync worker whenever we have a valid token
  useEffect(() => {
    if (!isTauri || !initialized || !accessToken) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    startSync(apiUrl, accessToken).catch(() => {});
  }, [initialized, accessToken]);

  if (!initialized || redirecting) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <LogoSpinner size="lg" speed="slow" />
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
