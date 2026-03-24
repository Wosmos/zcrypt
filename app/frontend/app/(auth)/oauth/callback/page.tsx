"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { getMe } from "@/lib/auth-api";
import { toast } from "@/store/toast";
import { LogoSpinner } from "@/components/ui/logo-spinner";

export default function OAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokens, setUser } = useAuthStore();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    // Tokens come in the URL fragment (#) for security (not sent to server in Referrer headers).
    // Errors come in query params (?error=...) from the backend.
    const hash = window.location.hash.substring(1);
    const fragmentParams = new URLSearchParams(hash);
    const accessToken = fragmentParams.get("access_token");
    const refreshToken = fragmentParams.get("refresh_token");
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
      <LogoSpinner size={32} speed="default" />
      <p className="text-sm text-[var(--color-text-secondary)]">
        Completing sign in...
      </p>
    </div>
  );
}
