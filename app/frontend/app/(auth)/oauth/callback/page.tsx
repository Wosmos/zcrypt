"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { getMe } from "@/lib/auth-api";
import { toast } from "@/store/toast";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokens, setUser } = useAuthStore();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const accessToken = searchParams.get("access_token");
    const refreshToken = searchParams.get("refresh_token");
    const error = searchParams.get("error");

    // Clear sensitive tokens from URL immediately
    window.history.replaceState({}, "", "/oauth/callback");

    if (error) {
      toast.error(error);
      router.replace("/login");
      return;
    }

    if (!accessToken || !refreshToken) {
      toast.error("Authentication failed");
      router.replace("/login");
      return;
    }

    setTokens(accessToken, refreshToken);

    getMe(accessToken)
      .then((user) => {
        setUser(user);
        router.replace("/dashboard");
      })
      .catch(() => {
        router.replace("/dashboard");
      });
  }, [searchParams, setTokens, setUser, router]);

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="h-8 w-8 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
      <p className="text-sm text-[var(--color-text-secondary)]">
        Completing sign in...
      </p>
    </div>
  );
}
