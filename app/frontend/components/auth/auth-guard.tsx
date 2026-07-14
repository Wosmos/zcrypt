"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { getMe } from "@/lib/auth-api";
import { refreshToken as refreshTokenApi } from "@/lib/auth-api";
import { prefetchFileList } from "@/store/files";
import { ensurePlatformStatus } from "@/store/platform";
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

    // Background onboarding check: fetch platform health once (shared/deduped with
    // usePlatformHealth) and redirect to /onboarding only if nothing is connected.
    // Never blocks initialization, so the dashboard renders immediately.
    const runOnboardingCheck = () => {
      if (skipOnboardingCheck) return;
      ensurePlatformStatus().then((statuses) => {
        // Empty means either nothing connected OR a transient error; only the
        // genuinely-empty connected set should bounce to onboarding, and an
        // error resolves to [] which we treat as "leave them where they are".
        if (statuses.length > 0 && !statuses.some((s) => s.connected)) {
          setRedirecting(true);
          router.replace("/onboarding");
        }
      });
    };

    async function init() {
      if (!accessToken && !refreshTokenValue) {
        setInitialized(true);
        router.replace("/login");
        return;
      }

      // Fast path: user already set by the login/register/2fa/oauth page. Show the
      // dashboard immediately and verify onboarding in the background.
      const existingUser = useAuthStore.getState().user;
      if (existingUser && accessToken) {
        setInitialized(true);
        prefetchFileList();
        runOnboardingCheck();
        return;
      }

      // Resolve a user from the current access token.
      if (accessToken) {
        try {
          const me = await getMe(accessToken);
          setUser(me);
          setInitialized(true);
          prefetchFileList();
          runOnboardingCheck();
          return;
        } catch {
          // token might be expired — try refresh
        }
      }

      // Refresh path.
      if (refreshTokenValue) {
        try {
          const data = await refreshTokenApi(refreshTokenValue);
          setTokens(data.access_token, data.refresh_token);
          const me = await getMe(data.access_token);
          setUser(me);
          setInitialized(true);
          prefetchFileList();
          runOnboardingCheck();
          return;
        } catch (err) {
          // Only a DEFINITIVE rejection (refresh token invalid/expired) should
          // log out. A transient failure on load (offline, 5xx, timeout) must
          // NOT nuke a valid session — keep the tokens and let authedFetch
          // refresh on the next real request. Mirrors the auth-fetch.ts fix.
          const status = (err as { status?: number })?.status;
          if (status !== 401 && status !== 403) {
            setInitialized(true);
            return;
          }
        }
      }

      // No credentials at all, or the refresh token was definitively rejected.
      clearAuth();
      setInitialized(true);
      router.replace("/login");
    }

    init();
  }, [initialized, accessToken, refreshTokenValue, router, skipOnboardingCheck, setUser, setTokens, setInitialized, clearAuth]);

  // Start desktop sync worker whenever we have a valid token
  useEffect(() => {
    if (!isTauri || !initialized || !accessToken || !refreshTokenValue) return;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
    startSync(apiUrl, accessToken, refreshTokenValue).catch(() => {});
  }, [initialized, accessToken, refreshTokenValue]);

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
