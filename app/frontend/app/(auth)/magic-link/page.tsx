"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { verifyMagicLink } from "@/lib/auth-api";
import { AuthStatusCard } from "@/components/auth/auth-status-card";
import { AuthLink, AUTH_LINK_CLASS } from "@/components/auth/auth-link";
import { toast } from "@/store/toast";
import { Wand2 } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";

export default function MagicLinkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setTokens, setUser } = useAuthStore();
  const handled = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const token = searchParams.get("token");
    if (!token) {
      setError("Invalid or missing link");
      return;
    }

    verifyMagicLink(token)
      .then((res) => {
        if (res.access_token && res.refresh_token) {
          setTokens(res.access_token, res.refresh_token);
          if (res.user) setUser(res.user);
          toast.success("Signed in successfully");
          router.replace("/dashboard");
        } else {
          setError("Authentication failed");
        }
      })
      .catch((err) => {
        setError(
          err instanceof Error ? err.message : "Link expired or invalid"
        );
      });
  }, [searchParams, setTokens, setUser, router]);

  if (error) {
    return (
      <AuthStatusCard
        icon={Wand2}
        tone="red"
        title="Link expired"
        action={
          <AuthLink
            onClick={() => router.push("/login")}
            className={`mt-4 text-sm ${AUTH_LINK_CLASS}`}
          >
            Back to login
          </AuthLink>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          {error}
        </p>
      </AuthStatusCard>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <LogoSpinner size={32} speed="default" />
      <p className="text-sm text-[var(--color-text-secondary)]">
        Verifying your login link...
      </p>
    </div>
  );
}
