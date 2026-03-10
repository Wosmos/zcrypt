"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { verifyMagicLink } from "@/lib/auth-api";
import { toast } from "@/store/toast";
import { Wand2 } from "lucide-react";

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
        setError(err instanceof Error ? err.message : "Link expired or invalid");
      });
  }, [searchParams, setTokens, setUser, router]);

  if (error) {
    return (
      <div className="card p-6 sm:p-8 text-center animate-fade-in">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-red-500/10 border border-red-500/20 mb-5">
          <Wand2 className="h-7 w-7 text-red-500" />
        </div>
        <h2 className="text-xl font-bold">Link expired</h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-2 max-w-sm mx-auto">
          {error}
        </p>
        <button
          onClick={() => router.push("/login")}
          className="mt-4 text-sm text-emerald-600 hover:text-emerald-500 dark:text-emerald-400 dark:hover:text-emerald-300 font-medium transition-colors"
        >
          Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <div className="h-8 w-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      <p className="text-sm text-[var(--color-text-secondary)]">
        Verifying your login link...
      </p>
    </div>
  );
}
