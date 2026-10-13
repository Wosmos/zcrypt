"use client";

import { useTranslations } from "next-intl";
import { Github } from "@/lib/icons";
import { GoogleIcon } from "@/components/icons/google";
import { getOAuthURL } from "@/lib/auth-api";
import { isTauri } from "@/lib/tauri";
import { bytesToHex, sha256Hex } from "@/lib/crypto";
import { toast } from "@/store/toast";
import { useConnectionBlocked } from "@/hooks/useConnectivity";

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
  const blocked = useConnectionBlocked();
  const btn =
    "flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm font-medium transition-colors hover:bg-[var(--color-surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:pointer-events-none disabled:opacity-50";
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
        <span className="h-px flex-1 bg-[var(--color-border)]" />
        {t("orContinueWith")}
        <span className="h-px flex-1 bg-[var(--color-border)]" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => startOAuth("google", t("oauthFailed"))}
          disabled={blocked}
          className={btn}
        >
          <GoogleIcon className="h-4 w-4" />
          Google
        </button>
        <button
          type="button"
          onClick={() => startOAuth("github", t("oauthFailed"))}
          disabled={blocked}
          className={btn}
        >
          <Github className="h-4 w-4" />
          GitHub
        </button>
      </div>
    </div>
  );
}
