"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { getMe, refreshToken as refreshTokenApi } from "@/lib/auth-api";
import { LogoSpinner } from "@/components/ui/logo-spinner";

/**
 * GuestGuard redirects authenticated users away from public/auth pages
 * to the dashboard. Shows children only if the user is NOT authenticated.
 */
export function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, refreshTokenValue, setUser, setTokens } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function check() {
      // OAuth relay/callback routes must NEVER be redirected to /dashboard, even
      // when this browser already holds a session. The desktop OAuth flow opens
      // the user's default browser — often already logged into the web app — and
      // lands on /oauth/desktop-relay; redirecting it here is exactly what made a
      // desktop login also spin up a full web session. Let these pages render as
      // themselves (relay shows "return to the app"; callback handles its own
      // fragment tokens).
      if (pathname?.startsWith("/oauth")) {
        setChecked(true);
        return;
      }

      // No tokens at all — user is a guest, show the page
      if (!accessToken && !refreshTokenValue) {
        setChecked(true);
        return;
      }

      // Try access token
      if (accessToken) {
        try {
          const me = await getMe(accessToken);
          setUser(me);
          router.replace("/dashboard");
          return;
        } catch {
          // Token expired, try refresh below
        }
      }

      // Try refresh token
      if (refreshTokenValue) {
        try {
          const data = await refreshTokenApi(refreshTokenValue);
          setTokens(data.access_token, data.refresh_token);
          const me = await getMe(data.access_token);
          setUser(me);
          router.replace("/dashboard");
          return;
        } catch {
          // Refresh failed — user is not authenticated
        }
      }

      // Not authenticated — show the page
      setChecked(true);
    }

    check();
  }, [accessToken, refreshTokenValue, router, setUser, setTokens, pathname]);

  if (!checked) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <LogoSpinner size="lg" speed="slow" />
      </div>
    );
  }

  return <>{children}</>;
}
