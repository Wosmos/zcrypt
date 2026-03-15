"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { verifyMagicLink } from "@/lib/auth-api";
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
      <div className="text-center animate-fade-in">
        <div className="flex justify-center mb-4">
          <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center">
            <Wand2 className="h-6 w-6 text-red-500" />
          </div>
        </div>
        <h2 className="text-xl font-bold">Link expired</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2">
          {error}
        </p>
        <button
          onClick={() => router.push("/login")}
          className="mt-4 text-sm text-cyan-600 hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300 font-medium transition-colors"
        >
          Back to login
        </button>
      </div>
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
