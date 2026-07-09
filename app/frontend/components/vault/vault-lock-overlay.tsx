"use client";

import { useEffect } from "react";
import { Lock } from "@/lib/icons";

/**
 * VaultLockOverlay — the full-screen mask shown while the vault is LOCKED and it
 * actually holds encrypted files. It is the VISIBLE half of the lock.
 *
 * The SECURITY guarantee is not this overlay — it is that, while locked, file
 * content, file/folder names, and thumbnail previews are genuinely absent from
 * memory and disk (store/passphrase `evictPlaintextOnLock` +
 * useThumbnail `clearThumbnails`, and names resolve to the literal "[locked]").
 * So removing this element via devtools reveals nothing: there is no plaintext
 * behind it to read. The overlay just makes "locked" unmistakable and un-clickable
 * around, and funnels the user to the single app-wide PassphraseModal.
 *
 * Rendered as `absolute inset-0` inside the app shell's `<main>` (which is
 * `position: relative` + `overflow` clips to its rounded panel), so the mask
 * covers ONLY the vault content — the sidebar and top bar stay visible and
 * usable. Sits below the app-wide PassphraseModal (z-50, portaled), which the
 * click opens on top of it.
 */
export function VaultLockOverlay({ onUnlock }: { onUnlock: () => void }) {
  // Freeze the vault panel's scroll while the mask is up: the mask is
  // `absolute inset-0` inside <main> (a scroll container), so without this it
  // would only span the first screenful and scroll with the content. Pinning
  // <main> to overflow:hidden (scrolled to top) makes the mask cover the entire
  // panel and stay put. Restored on unlock/unmount.
  useEffect(() => {
    const main = document.getElementById("main-content");
    if (!main) return;
    const prevOverflow = main.style.overflow;
    main.scrollTop = 0;
    main.style.overflow = "hidden";
    return () => {
      main.style.overflow = prevOverflow;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Vault locked"
      onClick={onUnlock}
      className="absolute inset-0 z-40 flex items-center justify-center bg-[var(--color-bg)]/70 px-6 backdrop-blur-lg animate-fade-in"
    >
      <div
        className="flex w-full max-w-sm flex-col items-center gap-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/70 px-8 py-10 text-center shadow-2xl backdrop-blur-lg animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
          <Lock className="h-8 w-8" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Vault locked</h2>
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Your files, folder names, and previews are encrypted on this device.
            Enter your passphrase to unlock and view them.
          </p>
        </div>
        <button
          type="button"
          onClick={onUnlock}
          className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-white transition-transform active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
        >
          <Lock className="h-4 w-4" />
          Unlock vault
        </button>
      </div>
    </div>
  );
}
