"use client";

import { useEffect, useRef, useState } from "react";
import { LockKey, LockKeyOpen } from "@phosphor-icons/react";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

/**
 * VaultLock — the single header control for the one-vault-passphrase model
 * (REBUILD_SPEC §3). There is exactly ONE vault passphrase; unlocking once
 * unlocks everything for the TTL.
 *
 * Rendered as a lock/unlock Toggle button (reusing the shared <Toggle>), NOT an
 * iOS-style slider — a padlock icon that clearly reads "locked / unlocked" so it
 * can't be mistaken for a dark-mode switch. Pressing it while locked opens the
 * unlock modal (`onUnlock`) and shows an optimistic "Unlocking…" state; if the
 * modal is cancelled the button reverts. Pressing an unlocked vault re-locks
 * immediately (`onLock`).
 *
 * Purely presentational: drive it from a single `useVaultLock()` instance owned
 * by the page (which also renders the one PassphraseModal). Never touches crypto.
 */
export interface VaultLockProps {
  /** Whether the vault is currently unlocked (a passphrase is cached). */
  unlocked: boolean;
  /** Seconds left on the TTL — drives the MM:SS countdown when unlocked. */
  remainingSeconds: number;
  /**
   * Unlocked persistently ("kept on this device") — no TTL. Shows "on this
   * device" instead of a countdown.
   */
  persistent?: boolean;
  /** Whether the unlock modal is currently open — lets the button revert if the
   *  user cancels instead of entering a passphrase. */
  modalOpen?: boolean;
  /** Open the single "Unlock your vault" modal. */
  onUnlock: () => void;
  /** Clear the cached passphrase (re-lock). */
  onLock: () => void;
  className?: string;
}

function formatCountdown(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function VaultLock({
  unlocked,
  remainingSeconds,
  persistent = false,
  modalOpen = false,
  onUnlock,
  onLock,
  className,
}: VaultLockProps) {
  // Optimistic "on" while the unlock modal is up. The button's resting position
  // is `unlocked`; `pending` carries the in-between (modal open, not yet unlocked).
  const [pending, setPending] = useState(false);
  const on = unlocked || pending;

  // Once genuinely unlocked, drop the optimistic flag.
  useEffect(() => {
    if (unlocked) setPending(false);
  }, [unlocked]);

  // If the modal opened for our press and then closed without unlocking (cancel),
  // revert the button to off.
  const wasModalOpen = useRef(false);
  useEffect(() => {
    if (modalOpen) {
      wasModalOpen.current = true;
    } else if (wasModalOpen.current) {
      wasModalOpen.current = false;
      if (!unlocked) setPending(false);
    }
  }, [modalOpen, unlocked]);

  const handlePressedChange = (next: boolean) => {
    if (next) {
      // Locked → open the unlock modal immediately (optimistic "Unlocking…").
      setPending(true);
      onUnlock();
    } else {
      // Turning off: re-lock only a genuinely unlocked vault; if we were merely
      // pending (modal open, not yet unlocked), just cancel the optimistic state.
      setPending(false);
      if (unlocked) onLock();
    }
  };

  return (
    <Toggle
      pressed={on}
      onPressedChange={handlePressedChange}
      variant="default"
      aria-label={
        unlocked
          ? persistent
            ? "Vault unlocked on this device — click to lock"
            : `Vault unlocked, locks in ${formatCountdown(remainingSeconds)} — click to lock`
          : pending
            ? "Unlocking vault"
            : "Vault locked — click to unlock"
      }
      className={cn(
        "h-9 gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
        on
          ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/15 hover:text-[var(--color-accent)] data-[state=on]:bg-[var(--color-accent)]/10 data-[state=on]:text-[var(--color-accent)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text-muted)]",
        className
      )}
    >
      {on ? (
        <LockKeyOpen weight="bold" className="h-5 w-5" aria-hidden />
      ) : (
        <LockKey weight="bold" className="h-5 w-5" aria-hidden />
      )}

      {/* Label — hidden on mobile (the icon + aria-label carry the state there). */}
      <span className="hidden items-center sm:inline-flex">
        {unlocked ? (
          persistent ? (
            <span>this device</span>
          ) : (
            <span className="tabular-nums">{formatCountdown(remainingSeconds)}</span>
          )
        ) : pending ? (
          <span>Unlocking…</span>
        ) : (
          <span>Locked</span>
        )}
      </span>
    </Toggle>
  );
}
