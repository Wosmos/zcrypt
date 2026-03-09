"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { getMe, refreshToken as refreshTokenApi } from "@/lib/auth-api";

/**
 * GuestGuard redirects authenticated users away from public/auth pages
 * to the dashboard. Shows children only if the user is NOT authenticated.
 */
export function GuestGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { accessToken, refreshTokenValue, setUser, setTokens } = useAuthStore();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    async function check() {
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
  }, [accessToken, refreshTokenValue, router, setUser, setTokens]);

  if (!checked) {
    return (
      <div className="flex items-center justify-center h-dvh">
        <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
