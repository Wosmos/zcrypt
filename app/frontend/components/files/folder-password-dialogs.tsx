"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "motion/react";
import { Lock, Key, Unlock, X } from "@/lib/icons";
import { PassphraseStrength } from "@/components/ui/passphrase-strength";
import type { FolderUnlockModalState } from "@/hooks/useFolderProtection";
import { tr } from "@/store/translate";

/**
 * Folder-password dialogs (spec §3): a verify-on-open unlock modal, a
 * set-password dialog (with confirm + a re-key progress view), and a
 * remove-protection confirm. All reuse the look of the vault PassphraseModal but
 * NEVER touch the vault passphrase store: folder passwords route through the
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
  const t = useTranslations("app.folderPw");
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
        aria-label={t("close")}
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
  const t = useTranslations("app.folderPw");
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
        {t("filesProgress", { done: progress.done, total: progress.total })}
      </p>
    </div>
  );
}

// ── Open a protected folder. Verify, then enter ──────────────────────────────

/**
 * The single folder-unlock modal, fed by `useFolderProtection().modalState`.
 * Verifies the typed password client-side (no server round-trip) before caching.
 * A wrong password sets `error` and keeps the modal open for a re-try.
 */
export function FolderUnlockModal({ state }: { state: FolderUnlockModalState }) {
  const t = useTranslations("app.folderPw");
  const { open, folderName, error, onConfirm, onClose } = state;
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // oxlint-disable-next-line react/set-state-in-effect
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
          title={t("unlockTitle")}
          subtitle={
            folderName && folderName !== "this folder"
              ? t("unlockNamed", { name: folderName })
              : t("unlockGeneric")
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
            placeholder={t("folderPassword")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={FIELD}
            autoComplete="off"
          />
          <div className="mt-5 flex gap-3">
            <button type="button" onClick={onClose} className={BTN_SECONDARY}>
              {t("cancel")}
            </button>
            <button type="submit" disabled={!password || verifying} className={BTN_PRIMARY}>
              {verifying ? t("verifying") : t("unlock")}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}

// ── Set / replace a folder password (with re-key progress) ────────────────────

export interface SetFolderPasswordState {
  open: boolean;
  folderName: string;
  /** Number of files that will be re-keyed (drives the "this will re-key N files" copy). */
  fileCount: number;
  /** Whether the vault is unlocked: required to re-key existing files. */
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
  const t = useTranslations("app.folderPw");
  const prefersReducedMotion = useReducedMotion();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      // oxlint-disable-next-line react/set-state-in-effect
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
      setError(tr("folderPw.enterPassword"));
      return;
    }
    if (password !== confirm) {
      setError(tr("folderPw.mismatch"));
      return;
    }
    if (needsVault) {
      setError(tr("folderPw.unlockFirstProtect"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(password);
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("folderPw.protectFailed"));
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
          title={t("protectTitle")}
          subtitle={folderName ? t("protectNamed", { name: folderName }) : t("protectGeneric")}
          onClose={onClose}
          closeDisabled={busy}
        />

        {sweeping ? (
          <SweepProgress
            message={t("rekeyingToFolder")}
            progress={progress!}
            prefersReducedMotion={prefersReducedMotion}
          />
        ) : (
          <>
            {fileCount > 0 && (
              <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5">
                <p className="text-xs text-[var(--color-text-secondary)]">
                  {vaultUnlocked
                    ? t("rekeyNoticeNow", { count: fileCount })
                    : t("rekeyNoticeLater", { count: fileCount })}
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
                placeholder={t("newPassword")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={FIELD}
                autoComplete="new-password"
              />
              <PassphraseStrength passphrase={password} />
              <input
                type="password"
                placeholder={t("confirmPassword")}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={FIELD}
                autoComplete="new-password"
              />
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={onClose} className={BTN_SECONDARY} disabled={busy}>
                  {t("cancel")}
                </button>
                {needsVault ? (
                  <button type="button" onClick={onRequestVaultUnlock} className={BTN_PRIMARY}>
                    {t("unlockVault")}
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={!password || !confirm || busy}
                    className={BTN_PRIMARY}
                  >
                    {t("protect")}
                  </button>
                )}
              </div>
            </form>
          </>
        )}
      </div>
    </div>,
    document.body,
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
  const {
    open,
    folderName,
    fileCount,
    vaultUnlocked,
    progress,
    onConfirm,
    onClose,
    onRequestVaultUnlock,
  } = state;
  const t = useTranslations("app.folderPw");
  const prefersReducedMotion = useReducedMotion();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      // oxlint-disable-next-line react/set-state-in-effect
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const needsVault = fileCount > 0 && !vaultUnlocked;

  const confirm = useCallback(async () => {
    if (busy) return;
    if (needsVault) {
      setError(tr("folderPw.unlockFirstRemove"));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("folderPw.removeFailed"));
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
          title={t("removeTitle")}
          subtitle={folderName ? t("removeNamed", { name: folderName }) : t("removeGeneric")}
          onClose={onClose}
          closeDisabled={busy}
        />

        {sweeping ? (
          <SweepProgress
            message={t("rekeyingBack")}
            progress={progress!}
            prefersReducedMotion={prefersReducedMotion}
          />
        ) : (
          <>
            <p className="mb-4 text-sm text-[var(--color-text-secondary)]">
              {fileCount > 0 ? t("removeBody", { count: fileCount }) : t("removeBodyEmpty")}
            </p>
            {error && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5">
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className={BTN_SECONDARY} disabled={busy}>
                {t("cancel")}
              </button>
              {needsVault ? (
                <button type="button" onClick={onRequestVaultUnlock} className={BTN_PRIMARY}>
                  {t("unlockVault")}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void confirm()}
                  disabled={busy}
                  className={BTN_PRIMARY}
                >
                  {t("removeProtection")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
