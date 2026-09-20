"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { getMe } from "@/lib/auth-api";
import { refreshToken as refreshTokenApi } from "@/lib/auth-api";
import { prefetchFileList } from "@/store/files";
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

    // Show onboarding to anyone who has never seen it, full stop.
    //
    // This used to ask "is any platform connected?" and redirect only when the
    // answer was no. That answer is always yes: zcrypt runs a shared global
    // token so a brand new user can upload immediately, and a global token
    // makes every platform report connected. So the redirect never fired, and
    // nobody ever saw the one screen that explains what the product is or that
    // they can plug in their own storage. 22 people verified an email and 8
    // ever stored a file.
    //
    // onboarded_at is a server-side stamp, so this means once per person, not
    // once per browser. Users who skip still get stamped: the screen's job is
    // to explain the product once, not to force a connection. Those who carry
    // on with shared storage are nudged later by the dashboard banner instead.
    const runOnboardingCheck = () => {
      if (skipOnboardingCheck) return;
      const current = useAuthStore.getState().user;
      if (current && !current.onboarded_at) {
        setRedirecting(true);
        router.replace("/onboarding");
      }
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
        void prefetchFileList();
        runOnboardingCheck();
        return;
      }

      // Resolve a user from the current access token.
      if (accessToken) {
        try {
          const me = await getMe(accessToken);
          setUser(me);
          setInitialized(true);
          void prefetchFileList();
          runOnboardingCheck();
          return;
        } catch {
          // token might be expired, try refresh
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
          void prefetchFileList();
          runOnboardingCheck();
          return;
        } catch (err) {
          // Only a DEFINITIVE rejection (refresh token invalid/expired) should
          // log out. A transient failure on load (offline, 5xx, timeout) must
          // NOT nuke a valid session. Keep the tokens and let authedFetch
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

    void init();
  }, [
    initialized,
    accessToken,
    refreshTokenValue,
    router,
    skipOnboardingCheck,
    setUser,
    setTokens,
    setInitialized,
    clearAuth,
  ]);

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
