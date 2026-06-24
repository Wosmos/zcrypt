"use client";

import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Lock, Unlock, X } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * VaultLock — the single header pill for the one-vault-passphrase model
 * (REBUILD_SPEC §3). There is exactly ONE vault passphrase; unlocking once
 * unlocks everything for the TTL.
 *
 * - Locked:   "Locked · Unlock"   (cyan unlock affordance)
 * - Unlocked: "Unlocked · MM:SS · Lock"  (tabular-nums countdown, X to re-lock)
 *
 * It is purely presentational: drive it from a single `useVaultLock()` instance
 * owned by the page (which also renders the one PassphraseModal via
 * `modalProps`). This component never touches crypto or the store directly.
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
  onUnlock,
  onLock,
  className,
}: VaultLockProps) {
  const reduceMotion = useReducedMotion();

  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 400, damping: 32 };

  return (
    <div className={cn("inline-flex", className)}>
      <AnimatePresence mode="wait" initial={false}>
        {unlocked ? (
          <motion.div
            key="unlocked"
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={transition}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 py-1 pl-2.5 pr-1 text-xs font-medium text-[var(--color-accent)]"
          >
            <Unlock className="h-3.5 w-3.5" aria-hidden />
            <span>Unlocked</span>
            <span aria-hidden className="text-[var(--color-accent)]/50">
              ·
            </span>
            {persistent ? (
              <span aria-label="Vault stays unlocked on this device">
                this device
              </span>
            ) : (
              <span
                className="tabular-nums"
                aria-label={`Vault locks in ${formatCountdown(remainingSeconds)}`}
              >
                {formatCountdown(remainingSeconds)}
              </span>
            )}
            <button
              type="button"
              onClick={onLock}
              aria-label="Lock your vault now"
              className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--color-accent)]/70 transition-colors hover:bg-[var(--color-accent)]/15 hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </motion.div>
        ) : (
          <motion.button
            key="locked"
            type="button"
            onClick={onUnlock}
            initial={reduceMotion ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={transition}
            aria-label="Unlock your vault"
            className="group inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface-1)] py-1 pl-2.5 pr-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden />
            <span>Locked</span>
            <span aria-hidden className="text-[var(--color-text-muted)]">
              ·
            </span>
            <span className="text-[var(--color-accent)]">Unlock</span>
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
