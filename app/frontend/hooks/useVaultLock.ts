"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePassphraseStore } from "@/store/passphrase";

/**
 * useVaultLock — the single source of truth for the "one vault passphrase"
 * mental model (REBUILD_SPEC §3).
 *
 * Wraps `usePassphraseStore` so the whole app talks to ONE lock. Unlocking once
 * unlocks everything for the existing 15-minute TTL. This is a UX consolidation
 * ONLY: it reuses `setPassphrase` / `getPassphrase` / `clear` /
 * `getRemainingMinutes` and changes NO crypto and NO TTL behavior.
 *
 * Zero-knowledge: the passphrase never leaves the client and is never logged.
 * It only flows from the modal into the cache and into the caller's decrypt
 * action via the `onUnlocked` callback.
 *
 * Usage:
 *   const vault = useVaultLock();
 *   // render exactly ONE modal:
 *   <PassphraseModal {...vault.modalProps} />
 *   // unlock-then-proceed for any decrypt action:
 *   vault.withPassphrase((pp) => startDownload(filename, pp));
 */
export interface UseVaultLock {
  /** True when a passphrase is currently cached (not expired). Reactive. */
  unlocked: boolean;
  /**
   * True when unlocked via "keep me unlocked on this device" — no TTL, survives
   * reloads. The pill shows "on this device" instead of a countdown. Reactive.
   */
  persistent: boolean;
  /** Whole minutes left on the TTL (0 when locked or persistent). Reactive, ceil()'d. */
  remainingMinutes: number;
  /** Seconds left on the TTL (0 when locked or persistent). Reactive; drives the MM:SS pill. */
  remainingSeconds: number;
  /**
   * Open the single "Unlock your vault" modal. Pass `onUnlocked` to run a
   * decrypt action with the passphrase the moment unlocking succeeds.
   */
  unlock: (onUnlocked?: (passphrase: string) => void) => void;
  /** Clear the cached passphrase (re-lock). */
  lock: () => void;
  /**
   * Run `action` with the vault passphrase. If already unlocked, runs it
   * immediately with the cached value (no prompt). If locked, opens the unlock
   * modal and runs `action` once the user unlocks. This is the one entry point
   * every decrypt action (download / preview / bulk / thumbnails / upload)
   * should use so there is never a per-file passphrase prompt.
   */
  withPassphrase: (action: (passphrase: string) => void) => void;
  /**
   * Spread onto exactly ONE <PassphraseModal /> rendered by the caller. The
   * modal is titled "Unlock your vault". Includes the wrong-passphrase error
   * banner plumbing — call `setError` from the caller's catch path to re-prompt.
   */
  modalProps: VaultLockModalProps;
  /** Set the modal's error banner (e.g. "Incorrect passphrase."). */
  setError: (error: string | null) => void;
  /** Imperatively open the modal again (e.g. re-prompt after a wrong passphrase). */
  reopen: (onUnlocked?: (passphrase: string) => void) => void;
}

export interface VaultLockModalProps {
  open: boolean;
  title: string;
  subtitle: string;
  confirmLabel: string;
  error: string | null;
  onConfirm: (passphrase: string) => void;
  onClose: () => void;
}

const MODAL_TITLE = "Unlock your vault";
const MODAL_SUBTITLE =
  "Enter it once to upload, download, and read your files";
const MODAL_CONFIRM = "Unlock";

export function useVaultLock(): UseVaultLock {
  // Subscribe to the raw cache fields so this hook (and the pill) re-render on
  // lock / unlock and on TTL expiry. `getPassphrase`/`getRemainingMinutes` are
  // imperative methods and would NOT trigger re-renders on their own.
  const cachedPassphrase = usePassphraseStore((s) => s.cachedPassphrase);
  const cacheUntil = usePassphraseStore((s) => s.cacheUntil);
  const persistent = usePassphraseStore((s) => s.persistent);
  const setPassphrase = usePassphraseStore((s) => s.setPassphrase);
  const getPassphrase = usePassphraseStore((s) => s.getPassphrase);
  const clear = usePassphraseStore((s) => s.clear);

  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Pending decrypt action to run with the passphrase once unlocked.
  const pendingRef = useRef<((passphrase: string) => void) | null>(null);

  // --- Live countdown ----------------------------------------------------
  // Tick a local clock so the pill re-renders without changing the store.
  // Resync on every `cacheUntil` change; tick every 1s while unlocked so the
  // MM:SS pill counts down smoothly (a 30s tick made the seconds jump in 30s
  // steps and read as a broken clock — L5). Remaining seconds are derived from
  // `cacheUntil` so the displayed value stays accurate regardless of cadence.
  // The interval only runs while a cache window exists (cheap), and is cleared
  // on unmount / on the next `cacheUntil` change.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!cacheUntil) return;
    setNow(Date.now());
    if (Date.now() >= cacheUntil) return; // already expired — no ticking needed
    const interval = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, [cacheUntil]);

  // Persistent ("remembered on this device") counts as unlocked with no expiry;
  // otherwise it's a live 15-min session window.
  const sessionUnlocked = !!cachedPassphrase && !!cacheUntil && now < cacheUntil;
  const unlocked = persistent || sessionUnlocked;
  const remainingMs = !persistent && cacheUntil ? Math.max(0, cacheUntil - now) : 0;
  const remainingSeconds = sessionUnlocked ? Math.ceil(remainingMs / 1000) : 0;
  const remainingMinutes = sessionUnlocked ? Math.ceil(remainingMs / 60_000) : 0;

  // --- Actions -----------------------------------------------------------
  const openModal = useCallback(
    (onUnlocked?: (passphrase: string) => void) => {
      pendingRef.current = onUnlocked ?? null;
      setError(null);
      setOpen(true);
    },
    []
  );

  const unlock = useCallback(
    (onUnlocked?: (passphrase: string) => void) => {
      openModal(onUnlocked);
    },
    [openModal]
  );

  const lock = useCallback(() => {
    clear();
    pendingRef.current = null;
    setError(null);
    setOpen(false);
  }, [clear]);

  const withPassphrase = useCallback(
    (action: (passphrase: string) => void) => {
      const cached = getPassphrase();
      if (cached) {
        action(cached);
        return;
      }
      openModal(action);
    },
    [getPassphrase, openModal]
  );

  const onConfirm = useCallback(
    (passphrase: string) => {
      // Guarantee the 15-min TTL cache regardless of the modal's "remember"
      // checkbox so the rest of the app sees a consistent unlocked state.
      setPassphrase(passphrase);
      setOpen(false);
      setError(null);
      const pending = pendingRef.current;
      pendingRef.current = null;
      if (pending) pending(passphrase);
    },
    [setPassphrase]
  );

  const onClose = useCallback(() => {
    pendingRef.current = null;
    setError(null);
    setOpen(false);
  }, []);

  const modalProps: VaultLockModalProps = {
    open,
    title: MODAL_TITLE,
    subtitle: MODAL_SUBTITLE,
    confirmLabel: MODAL_CONFIRM,
    error,
    onConfirm,
    onClose,
  };

  return {
    unlocked,
    persistent,
    remainingMinutes,
    remainingSeconds,
    unlock,
    lock,
    withPassphrase,
    modalProps,
    setError,
    reopen: openModal,
  };
}
