"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePassphraseStore } from "@/store/passphrase";
import { Lock, X, Loader2 } from "@/lib/icons";
import { PassphraseStrength } from "@/components/ui/passphrase-strength";
import { Checkbox } from "@/components/ui/checkbox";

interface PassphraseModalProps {
  open: boolean;
  onConfirm: (passphrase: string) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  error?: string | null;
  /**
   * Optional async guard run BEFORE the passphrase is cached / the modal closes.
   * Resolves `false` only when the passphrase is definitively wrong; the modal
   * then shows an inline error and STAYS OPEN instead of silently accepting a bad
   * passphrase (which used to surface later as failed decrypts). Omit it where
   * there's nothing to verify against — e.g. when SETTING a new passphrase.
   */
  verify?: (passphrase: string) => Promise<boolean>;
}

export function PassphraseModal({
  open,
  onConfirm,
  onClose,
  title = "Enter Passphrase",
  subtitle,
  confirmLabel = "Confirm",
  error,
  verify,
}: PassphraseModalProps) {
  const [passphrase, setPassphrase] = useState("");
  const rememberDevicePref = usePassphraseStore((s) => s.rememberDevice);
  const setRememberDevice = usePassphraseStore((s) => s.setRememberDevice);
  const cachePassphrase = usePassphraseStore((s) => s.setPassphrase);
  const [remember, setRemember] = useState(rememberDevicePref);
  const [verifying, setVerifying] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassphrase("");
      setVerifying(false);
      setLocalError(null);
      setRemember(usePassphraseStore.getState().rememberDevice);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleConfirm = useCallback(async () => {
    if (!passphrase || verifying) return;
    setLocalError(null);

    // Verify the passphrase BEFORE caching it, so a wrong one is rejected right
    // here in the modal instead of being cached and only failing later when a
    // file won't decrypt. `verify` returns false ONLY when it's definitively
    // wrong; network/inconclusive cases fall through and let the user proceed.
    if (verify) {
      setVerifying(true);
      let ok = true;
      try {
        ok = await verify(passphrase);
      } catch {
        ok = true; // inconclusive — don't block; decrypt still guards downstream
      }
      setVerifying(false);
      if (!ok) {
        setLocalError(
          "That passphrase doesn't match this vault. Check it and try again."
        );
        inputRef.current?.focus();
        inputRef.current?.select();
        return; // keep the modal open; nothing cached, vault stays locked
      }
    }

    // Record the device-remember preference first, then cache. setPassphrase
    // persists encrypted on THIS device iff rememberDevice is on (so the user is
    // never re-prompted here); otherwise it's a 15-minute in-memory session.
    setRememberDevice(remember);
    cachePassphrase(passphrase);
    onConfirm(passphrase);
    setPassphrase("");
  }, [
    passphrase,
    verifying,
    verify,
    remember,
    setRememberDevice,
    cachePassphrase,
    onConfirm,
  ]);

  const handleClose = useCallback(() => {
    if (verifying) return; // don't dismiss mid-check
    setPassphrase("");
    setLocalError(null);
    onClose();
  }, [verifying, onClose]);

  if (!open) return null;

  const shownError = localError ?? error;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              {subtitle && (
                <p className="text-xs text-[var(--color-text-muted)] max-w-[280px]">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {shownError && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5">
            <p className="text-xs text-red-600 dark:text-red-400">{shownError}</p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleConfirm();
          }}
        >
          <input
            ref={inputRef}
            type="password"
            placeholder="Your encryption passphrase"
            value={passphrase}
            onChange={(e) => {
              setPassphrase(e.target.value);
              if (localError) setLocalError(null);
            }}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]/40 transition-all"
            autoComplete="off"
          />

          <PassphraseStrength passphrase={passphrase} />

          <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
            <Checkbox
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            <span className="text-xs text-[var(--color-text-secondary)]">
              Keep me unlocked on this device
            </span>
          </label>

          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={handleClose}
              disabled={verifying}
              className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!passphrase || verifying}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#1a1f36] dark:bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-[#252b45] dark:hover:bg-cyan-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
              {verifying ? "Unlocking…" : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
