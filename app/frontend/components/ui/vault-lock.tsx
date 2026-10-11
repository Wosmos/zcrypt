"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { LockKey, LockKeyOpen } from "@phosphor-icons/react";
import { Toggle } from "@/components/ui/toggle";
import { cn, formatDuration } from "@/lib/utils";

/**
 * VaultLock: the single header control for the one-vault-passphrase model
 * (REBUILD_SPEC §3). There is exactly ONE vault passphrase; unlocking once
 * unlocks everything for the TTL.
 *
 * Rendered as a lock/unlock Toggle button (reusing the shared <Toggle>), NOT an
 * iOS-style slider: a padlock icon that clearly reads "locked / unlocked" so it
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
  /** Seconds left on the TTL: drives the MM:SS countdown when unlocked. */
  remainingSeconds: number;
  /**
   * Unlocked persistently ("kept on this device"): no TTL. Shows "on this
   * device" instead of a countdown.
   */
  persistent?: boolean;
  /** Whether the unlock modal is currently open: lets the button revert if the
   *  user cancels instead of entering a passphrase. */
  modalOpen?: boolean;
  /** Open the single "Unlock your vault" modal. */
  onUnlock: () => void;
  /** Clear the cached passphrase (re-lock). */
  onLock: () => void;
  className?: string;
  tour?: string;
  iconOnly?: boolean;
}

const formatCountdown = (totalSeconds: number) =>
  formatDuration(totalSeconds, { padMinutes: true, showHours: false });

/** Shared state for every vault-lock control: the optimistic "unlocking" flag,
 *  the toggle action and an accessible label. */
function useVaultLockState({
  unlocked,
  remainingSeconds,
  persistent = false,
  modalOpen = false,
  onUnlock,
  onLock,
}: VaultLockProps) {
  const t = useTranslations("vaultLock");
  // Optimistic "on" while the unlock modal is up. The button's resting position
  // is `unlocked`; `pending` carries the in-between (modal open, not yet unlocked).
  const [pending, setPending] = useState(false);
  const on = unlocked || pending;

  // Drop the optimistic flag once genuinely unlocked, or when the modal that
  // opened for our press closes without unlocking (cancel). Adjusted during
  // render from the previous props, so there's no effect round-trip.
  const [prevUnlocked, setPrevUnlocked] = useState(unlocked);
  const [prevModalOpen, setPrevModalOpen] = useState(modalOpen);
  if (unlocked !== prevUnlocked) {
    setPrevUnlocked(unlocked);
    if (unlocked) setPending(false);
  }
  if (modalOpen !== prevModalOpen) {
    setPrevModalOpen(modalOpen);
    if (!modalOpen && !unlocked) setPending(false);
  }

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

  const ariaLabel = unlocked
    ? persistent
      ? t("ariaUnlockedDevice")
      : t("ariaUnlockedTimer", { time: formatCountdown(remainingSeconds) })
    : pending
      ? t("ariaUnlocking")
      : t("ariaLocked");
  return { on, pending, ariaLabel, toggle: () => handlePressedChange(!on), handlePressedChange };
}

export function VaultLock(props: VaultLockProps) {
  const {
    unlocked,
    remainingSeconds,
    persistent = false,
    className,
    tour,
    iconOnly = false,
  } = props;
  const t = useTranslations("vaultLock");
  const tc = useTranslations("common");
  const { on, pending, ariaLabel, handlePressedChange } = useVaultLockState(props);

  return (
    <Toggle
      pressed={on}
      onPressedChange={handlePressedChange}
      variant="default"
      data-tour={tour}
      aria-label={ariaLabel}
      className={cn(
        "h-9 gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
        on
          ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/15 hover:text-[var(--color-accent)] data-[state=on]:bg-[var(--color-accent)]/10 data-[state=on]:text-[var(--color-accent)]"
          : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text-muted)]",
        className,
      )}
    >
      {on ? (
        <LockKeyOpen weight="bold" className="h-5 w-5" aria-hidden />
      ) : (
        <LockKey weight="bold" className="h-5 w-5" aria-hidden />
      )}

      {/* Label: hidden on mobile (the icon + aria-label carry the state there). */}
      <span className={cn("hidden items-center", !iconOnly && "sm:inline-flex")}>
        {unlocked ? (
          persistent ? (
            <span>{t("thisDevice")}</span>
          ) : (
            <span className="tabular-nums">{formatCountdown(remainingSeconds)}</span>
          )
        ) : pending ? (
          <span>{tc("unlocking")}</span>
        ) : (
          <span>{t("locked")}</span>
        )}
      </span>
    </Toggle>
  );
}

/**
 * The sidebar's vault status card: says plainly whether the vault is locked,
 * what that means right now, and offers the one action that changes it.
 */
export function VaultLockCard(props: VaultLockProps) {
  const {
    unlocked,
    remainingSeconds,
    persistent = false,
    className,
    tour,
    iconOnly = false,
  } = props;
  const t = useTranslations("vaultLock");
  const tc = useTranslations("common");
  const { on, pending, ariaLabel, toggle } = useVaultLockState(props);
  const Icon = on ? LockKeyOpen : LockKey;
  const tone = unlocked
    ? "border-emerald-500/30 bg-emerald-500/[0.07] text-emerald-600 dark:text-emerald-400"
    : "border-amber-500/35 bg-amber-500/[0.08] text-amber-600 dark:text-amber-400";

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        title={ariaLabel}
        data-tour={tour}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-xl border transition-colors hover:brightness-110",
          tone,
          className,
        )}
      >
        <Icon weight="bold" className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  return (
    <div data-tour={tour} className={cn("rounded-xl border p-3", tone, className)}>
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-current/10">
          <Icon weight="bold" className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-semibold leading-tight text-[var(--color-text)]">
            {unlocked ? t("cardUnlocked") : pending ? tc("unlocking") : t("cardLocked")}
          </span>
          <span className="mt-0.5 block text-[11px] leading-snug text-[var(--color-text-muted)]">
            {unlocked
              ? persistent
                ? t("hintDevice")
                : t("hintTimer", { time: formatCountdown(remainingSeconds) })
              : t("hintLocked")}
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={toggle}
        aria-label={ariaLabel}
        className={cn(
          "mt-2.5 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
          unlocked
            ? "bg-[var(--color-surface-2)] text-[var(--color-text)] hover:bg-[var(--color-surface-3)]"
            : "bg-amber-500 text-black hover:bg-amber-400",
        )}
      >
        {unlocked ? (
          <LockKey weight="bold" className="h-3.5 w-3.5" aria-hidden />
        ) : (
          <LockKeyOpen weight="bold" className="h-3.5 w-3.5" aria-hidden />
        )}
        {unlocked ? t("actionLock") : t("actionUnlock")}
      </button>
    </div>
  );
}
