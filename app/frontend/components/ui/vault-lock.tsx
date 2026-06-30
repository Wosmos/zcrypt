"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * VaultLock — the single header control for the one-vault-passphrase model
 * (REBUILD_SPEC §3). There is exactly ONE vault passphrase; unlocking once
 * unlocks everything for the TTL.
 *
 * Rendered as an iOS-style glassy toggle. Flipping it ON slides the knob first,
 * and only once the slide COMPLETES does the unlock modal open (`onUnlock`).
 * While the modal is up the knob stays optimistically ON and the label reads
 * "Unlocking…"; confirming keeps it on, cancelling slides it back off. Flipping
 * an unlocked vault OFF re-locks immediately (`onLock`).
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
  /** Whether the unlock modal is currently open — lets the switch revert if the
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
  const reduceMotion = useReducedMotion();

  // Optimistic "on" while we slide + wait for the passphrase modal. The knob's
  // resting position is `unlocked`; `pending` carries the in-between flip.
  const [pending, setPending] = useState(false);
  const on = unlocked || pending;

  // Once genuinely unlocked, drop the optimistic flag (knob is already on).
  useEffect(() => {
    if (unlocked) setPending(false);
  }, [unlocked]);

  // If the modal opened for our flip and then closed without unlocking (cancel),
  // slide the knob back off.
  const wasModalOpen = useRef(false);
  useEffect(() => {
    if (modalOpen) {
      wasModalOpen.current = true;
    } else if (wasModalOpen.current) {
      wasModalOpen.current = false;
      if (!unlocked) setPending(false);
    }
  }, [modalOpen, unlocked]);

  const spring = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 700, damping: 36, mass: 0.9 };

  const handleClick = () => {
    if (on) {
      setPending(false);
      onLock();
    } else {
      setPending(true); // slide on; modal opens once the slide completes
    }
  };

  // Open the modal only after the ON-slide settles (the "switch, then modal" feel).
  const handleSlideComplete = () => {
    if (pending && !unlocked) onUnlock();
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={handleClick}
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
        "group inline-flex items-center gap-2.5 rounded-full p-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
        className
      )}
    >
      {/* Clean iOS-style switch — solid accent when on, subtle track when off */}
      <span
        className={cn(
          "relative inline-block h-6 w-[42px] flex-shrink-0 rounded-full ring-1 ring-inset transition-colors duration-300",
          on
            ? "bg-[var(--color-accent)] ring-black/10"
            : "bg-[var(--color-surface-2)] ring-white/10"
        )}
      >
        <motion.span
          className="absolute left-[2px] top-[2px] h-5 w-5 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
          animate={{ x: on ? 18 : 0 }}
          transition={spring}
          onAnimationComplete={handleSlideComplete}
        />
      </span>

      {/* Live state label */}
      {/* Label — hidden on mobile (the switch + aria-label carry the state there). */}
      <span className="hidden items-center sm:inline-flex">
        {unlocked ? (
          <span className="inline-flex items-center gap-1 text-[var(--color-accent)]">
            Unlocked
            <span aria-hidden className="text-[var(--color-accent)]/50">
              ·
            </span>
            {persistent ? (
              <span>this device</span>
            ) : (
              <span className="tabular-nums">{formatCountdown(remainingSeconds)}</span>
            )}
          </span>
        ) : pending ? (
          <span className="text-[var(--color-text-muted)]">Unlocking…</span>
        ) : (
          <span className="text-[var(--color-text-secondary)] transition-colors group-hover:text-[var(--color-text)]">
            Locked
          </span>
        )}
      </span>
    </button>
  );
}
