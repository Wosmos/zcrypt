"use client";

import { Github } from "@/lib/icons";
import { GoogleIcon } from "@/components/icons/google";
import { getOAuthURL } from "@/lib/auth-api";
import { isTauri } from "@/lib/tauri";

/** Generate a random session ID for desktop OAuth polling. */
function randomSessionId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Event dispatched when a desktop OAuth session starts, so the login page can poll. */
export const DESKTOP_OAUTH_SESSION_KEY = "zcrypt_desktop_oauth_session";

async function startOAuth(provider: string) {
  if (isTauri) {
    const session = randomSessionId();
    // Store session ID so the login page can start polling
    sessionStorage.setItem(DESKTOP_OAUTH_SESSION_KEY, session);
    window.dispatchEvent(new Event("desktop-oauth-start"));

    const url = getOAuthURL(provider) + `?platform=desktop&session=${session}`;
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } else {
    window.location.href = getOAuthURL(provider);
  }
}

export function OAuthButtons() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => startOAuth("google")}
          className="flex items-center justify-center gap-2 h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-1)] transition-colors text-sm font-medium"
        >
          <GoogleIcon className="h-4 w-4" />
          Google
        </button>
        <button
          onClick={() => startOAuth("github")}
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
