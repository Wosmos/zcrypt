"use client";

import { useTranslations } from "next-intl";
import { Github } from "@/lib/icons";
import { GoogleIcon } from "@/components/icons/google";
import { getOAuthURL } from "@/lib/auth-api";
import { isTauri } from "@/lib/tauri";
import { bytesToHex, sha256Hex } from "@/lib/crypto";
import { toast } from "@/store/toast";

function randomHex(bytes: number) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** Event dispatched when a desktop OAuth session starts, so the login page can poll. */
export const DESKTOP_OAUTH_SESSION_KEY = "zcrypt_desktop_oauth_session";

async function startOAuth(provider: string, failedMessage: string) {
  try {
    if (isTauri) {
      const session = randomHex(16);
      const verifier = randomHex(32);
      const challenge = await sha256Hex(new TextEncoder().encode(verifier));
      const code = challenge.slice(0, 6).toUpperCase();
      sessionStorage.setItem(
        DESKTOP_OAUTH_SESSION_KEY,
        JSON.stringify({ session, verifier, code }),
      );
      window.dispatchEvent(new Event("desktop-oauth-start"));

      const url =
        getOAuthURL(provider) + `?platform=desktop&session=${session}&challenge=${challenge}`;
      // Open the OAuth page in the system browser via the opener plugin. NOT the
      // shell plugin's open(): that routes to a desktop-only (xdg-open) backend
      // that silently fails on Android, which made these buttons appear frozen.
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } else {
      window.location.href = getOAuthURL(provider);
    }
  } catch (err) {
    // Never let a failed open die silently (that was the frozen-button bug).
    toast.error(err instanceof Error ? err.message : failedMessage);
  }
}

export function OAuthButtons() {
  const t = useTranslations("auth");
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => startOAuth("google", t("oauthFailed"))}
          className="flex items-center justify-center gap-2 h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-1)] transition-colors text-sm font-medium"
        >
          <GoogleIcon className="h-4 w-4" />
          Google
        </button>
        <button
          onClick={() => startOAuth("github", t("oauthFailed"))}
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
            {t("orContinueWithEmail")}
          </span>
        </div>
      </div>
    </div>
  );
}
