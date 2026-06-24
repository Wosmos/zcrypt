"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePassphraseStore } from "@/store/passphrase";
import { Lock, X } from "@/lib/icons";
import { PassphraseStrength } from "@/components/ui/passphrase-strength";

interface PassphraseModalProps {
  open: boolean;
  onConfirm: (passphrase: string) => void;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  error?: string | null;
}

export function PassphraseModal({
  open,
  onConfirm,
  onClose,
  title = "Enter Passphrase",
  subtitle,
  confirmLabel = "Confirm",
  error,
}: PassphraseModalProps) {
  const [passphrase, setPassphrase] = useState("");
  const rememberDevicePref = usePassphraseStore((s) => s.rememberDevice);
  const setRememberDevice = usePassphraseStore((s) => s.setRememberDevice);
  const cachePassphrase = usePassphraseStore((s) => s.setPassphrase);
  const [remember, setRemember] = useState(rememberDevicePref);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setPassphrase("");
      setRemember(usePassphraseStore.getState().rememberDevice);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleConfirm = useCallback(() => {
    if (!passphrase) return;
    // Record the device-remember preference first, then cache. setPassphrase
    // persists encrypted on THIS device iff rememberDevice is on (so the user is
    // never re-prompted here); otherwise it's a 15-minute in-memory session.
    setRememberDevice(remember);
    cachePassphrase(passphrase);
    onConfirm(passphrase);
    setPassphrase("");
  }, [passphrase, remember, setRememberDevice, cachePassphrase, onConfirm]);

  const handleClose = useCallback(() => {
    setPassphrase("");
    onClose();
  }, [onClose]);

  if (!open) return null;

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

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5">
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirm();
          }}
        >
          <input
            ref={inputRef}
            type="password"
            placeholder="Your encryption passphrase"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]/40 transition-all"
            autoComplete="off"
          />

          <PassphraseStrength passphrase={passphrase} />

          <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[var(--color-border)] accent-cyan-500"
            />
            <span className="text-xs text-[var(--color-text-secondary)]">
              Keep me unlocked on this device
            </span>
          </label>

          <div className="flex gap-3 mt-5">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!passphrase}
              className="flex-1 rounded-xl bg-[#1a1f36] dark:bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-[#252b45] dark:hover:bg-cyan-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
