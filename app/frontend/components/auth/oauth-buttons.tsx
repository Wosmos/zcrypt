"use client";

import { Github } from "lucide-react";
import { GoogleIcon } from "@/components/icons/google";
import { getOAuthURL } from "@/lib/auth-api";

export function OAuthButtons() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => { window.location.href = getOAuthURL("google"); }}
          className="flex items-center justify-center gap-2 h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-1)] transition-colors text-sm font-medium"
        >
          <GoogleIcon className="h-4 w-4" />
          Google
        </button>
        <button
          onClick={() => { window.location.href = getOAuthURL("github"); }}
          className="flex items-center justify-center gap-2 h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-1)] transition-colors text-sm font-medium"
        >
          <Github className="h-4 w-4" />
          GitHub
        </button>
      </div>
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--color-border)]" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="bg-[var(--color-surface)] px-3 text-[var(--color-text-muted)]">
            or continue with email
          </span>
        </div>
      </div>
    </div>
  );
}
