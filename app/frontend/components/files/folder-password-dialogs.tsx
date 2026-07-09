"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { Lock, Key, Unlock, X } from "@/lib/icons";
import { PassphraseStrength } from "@/components/ui/passphrase-strength";
import type { FolderUnlockModalState } from "@/hooks/useFolderProtection";

/**
 * Folder-password dialogs (spec §3): a verify-on-open unlock modal, a
 * set-password dialog (with confirm + a re-key progress view), and a
 * remove-protection confirm. All reuse the look of the vault PassphraseModal but
 * NEVER touch the vault passphrase store — folder passwords route through the
 * caller's verify/cache callbacks only. The password never leaves the device.
 */

const OVERLAY =
  "fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm";
const PANEL =
  "w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl";
const FIELD =
  "w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3 text-sm placeholder:text-[var(--color-text-muted)] outline-none transition-all focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/30";
const BTN_PRIMARY =
  "flex-1 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
const BTN_SECONDARY =
  "flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-40";

function HeaderRow({
  icon,
  title,
  subtitle,
  onClose,
  closeDisabled,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
          {icon}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{title}</h3>
          {subtitle && (
            <p className="max-w-[260px] text-xs text-[var(--color-text-muted)]">{subtitle}</p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        disabled={closeDisabled}
        aria-label="Close"
        className="p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)] disabled:opacity-40"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Re-key progress bar shared by the protect and remove-password dialogs. */
function SweepProgress({
  message,
  progress,
  prefersReducedMotion,
}: {
  message: string;
  progress: { done: number; total: number };
  prefersReducedMotion: boolean | null;
}) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  return (
    <div className="space-y-3 py-2">
      <p className="text-sm text-[var(--color-text-secondary)]">{message}</p>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        <motion.div
          className="h-full rounded-full bg-[var(--color-accent)]"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.25 }}
        />
      </div>
      <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
        {progress.done} / {progress.total} files
      </p>
    </div>
  );
}

// ── Open a protected folder — verify, then enter ──────────────────────────────

/**
 * The single folder-unlock modal, fed by `useFolderProtection().modalState`.
 * Verifies the typed password client-side (no server round-trip) before caching.
 * A wrong password sets `error` and keeps the modal open for a re-try.
 */
export function FolderUnlockModal({ state }: { state: FolderUnlockModalState }) {
  const { open, folderName, error, onConfirm, onClose } = state;
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setVerifying(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const submit = useCallback(async () => {
    if (!password || verifying) return;
    setVerifying(true);
    await Promise.resolve(onConfirm(password));
    // onConfirm closes the modal on success, or sets `error` on failure; either
    // way re-enable so a wrong attempt can be retried.
    setVerifying(false);
  }, [password, verifying, onConfirm]);

  if (!open) return null;

  return createPortal(
    <div className={OVERLAY} onClick={onClose}>
      <div className={PANEL} onClick={(e) => e.stopPropagation()}>
        <HeaderRow
          icon={<Lock className="h-5 w-5" />}
          title="Unlock protected folder"
          subtitle={
            folderName && folderName !== "this folder"
              ? `Enter the password for "${folderName}"`
              : "Enter this folder's password to view its files"
          }
          onClose={onClose}
        />
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <input
            ref={inputRef}
            type="password"
            placeholder="Folder password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={FIELD}
            autoComplete="off"
          />
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>
              Cancel
            </button>
            <button type="submit" disabled={!password || verifying} className={BTN_PRIMARY}>
              {verifying ? "Verifying…" : "Unlock"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

// ── Set / replace a folder password (with re-key progress) ────────────────────

export interface SetFolderPasswordState {
  open: boolean;
  folderName: string;
  /** Number of files that will be re-keyed (drives the "this will re-key N files" copy). */
  fileCount: number;
  /** Whether the vault is unlocked — required to re-key existing files. */
  vaultUnlocked: boolean;
  /** Re-key progress while submitting, or null when idle. */
  progress: { done: number; total: number } | null;
  /** Submit the new password. Resolves when done; rejects with a message on error. */
  onSubmit: (password: string) => Promise<void>;
  onClose: () => void;
  /** Ask the page to unlock the vault first (when locked). */
  onRequestVaultUnlock: () => void;
}

export function SetFolderPasswordDialog({ state }: { state: SetFolderPasswordState }) {
  const {
    open,
    folderName,
    fileCount,
    vaultUnlocked,
    progress,
    onSubmit,
    onClose,
    onRequestVaultUnlock,
  } = state;
  const prefersReducedMotion = useReducedMotion();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      setConfirm("");
      setError(null);
      setBusy(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const needsVault = fileCount > 0 && !vaultUnlocked;

  const submit = useCallback(async () => {
    if (busy) return;
    if (!password) {
      setError("Enter a password.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (needsVault) {
      setError("Unlock your vault first to re-key the files in this folder.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to protect folder.");
      setBusy(false);
    }
  }, [busy, password, confirm, needsVault, onSubmit]);

  if (!open) return null;

  const sweeping = progress != null;

  return createPortal(
    <div className={OVERLAY} onClick={busy ? undefined : onClose}>
      <div className={PANEL} onClick={(e) => e.stopPropagation()}>
        <HeaderRow
          icon={<Key className="h-5 w-5" />}
          title="Protect folder with a password"
          subtitle={
            folderName ? `Set a password for "${folderName}"` : "Set a password for this folder"
          }
          onClose={onClose}
          closeDisabled={busy}
        />

        {sweeping ? (
          <SweepProgress
            message="Re-keying files to the folder password…"
            progress={progress!}
            prefersReducedMotion={prefersReducedMotion}
          />
        ) : (
          <>
            {fileCount > 0 && (
              <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5">
                <p className="text-xs text-[var(--color-text-secondary)]">
                  This folder has {fileCount} file{fileCount === 1 ? "" : "s"}. They will be re-keyed
                  to the new folder password{" "}
                  {vaultUnlocked ? "now" : "— unlock your vault first"}.
                </p>
              </div>
            )}
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5">
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (needsVault) onRequestVaultUnlock();
                else void submit();
              }}
              className="space-y-3"
            >
              <input
                ref={inputRef}
                type="password"
                placeholder="New folder password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={FIELD}
                autoComplete="new-password"
              />
              <PassphraseStrength passphrase={password} />
              <input
                type="password"
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={FIELD}
                autoComplete="new-password"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose} className={BTN_SECONDARY} disabled={busy}>
                  Cancel
                </button>
                {needsVault ? (
                  <button type="button" onClick={onRequestVaultUnlock} className={BTN_PRIMARY}>
                    Unlock vault
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!password || !confirm || busy}
                    className={BTN_PRIMARY}
                  >
                    Protect folder
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ── Remove protection (with re-key-back progress) ─────────────────────────────

export interface RemoveFolderPasswordState {
  open: boolean;
  folderName: string;
  fileCount: number;
  vaultUnlocked: boolean;
  /** Re-key-back progress while submitting, or null when idle. */
  progress: { done: number; total: number } | null;
  /** Confirm removing protection. Resolves when done; rejects with a message. */
  onConfirm: () => Promise<void>;
  onClose: () => void;
  onRequestVaultUnlock: () => void;
}

export function RemoveFolderPasswordDialog({ state }: { state: RemoveFolderPasswordState }) {
  const { open, folderName, fileCount, vaultUnlocked, progress, onConfirm, onClose, onRequestVaultUnlock } =
    state;
  const prefersReducedMotion = useReducedMotion();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const needsVault = fileCount > 0 && !vaultUnlocked;

  const confirm = useCallback(async () => {
    if (busy) return;
    if (needsVault) {
      setError("Unlock your vault first to re-key the files back.");
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove protection.");
      setBusy(false);
    }
  }, [busy, needsVault, onConfirm]);

  if (!open) return null;

  const sweeping = progress != null;

  return createPortal(
    <div className={OVERLAY} onClick={busy ? undefined : onClose}>
      <div className={PANEL} onClick={(e) => e.stopPropagation()}>
        <HeaderRow
          icon={<Unlock className="h-5 w-5" />}
          title="Remove folder password"
          subtitle={
            folderName ? `Stop protecting "${folderName}"` : "Stop protecting this folder"
          }
          onClose={onClose}
          closeDisabled={busy}
        />

        {sweeping ? (
          <SweepProgress
            message="Re-keying files back to your vault passphrase…"
            progress={progress!}
            prefersReducedMotion={prefersReducedMotion}
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
              {fileCount > 0
                ? `The ${fileCount} file${fileCount === 1 ? "" : "s"} in this folder will be re-keyed back to your vault passphrase, then the folder password is removed.`
                : "This folder will no longer require a password."}
            </p>
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5">
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className={BTN_SECONDARY} disabled={busy}>
                Cancel
              </button>
              {needsVault ? (
                <button type="button" onClick={onRequestVaultUnlock} className={BTN_PRIMARY}>
                  Unlock vault
                </button>
              ) : (
                <button type="button" onClick={() => void confirm()} disabled={busy} className={BTN_PRIMARY}>
                  Remove protection
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
