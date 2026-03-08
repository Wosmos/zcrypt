"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePassphraseStore } from "@/store/passphrase";
import { Lock, X } from "lucide-react";
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
  const [remember, setRemember] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const { setPassphrase: cachePassphrase } = usePassphraseStore();

  useEffect(() => {
    if (open) {
      setPassphrase("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleConfirm = useCallback(() => {
    if (!passphrase) return;
    if (remember) {
      cachePassphrase(passphrase);
    }
    onConfirm(passphrase);
    setPassphrase("");
  }, [passphrase, remember, cachePassphrase, onConfirm]);

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
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Lock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">{title}</h3>
              {subtitle && (
                <p className="text-[11px] text-[var(--color-text-muted)] truncate max-w-[240px]">
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
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/40 transition-all"
            autoComplete="off"
          />

          <PassphraseStrength passphrase={passphrase} />

          <label className="flex items-center gap-2 mt-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-[var(--color-border)] accent-emerald-500"
            />
            <span className="text-xs text-[var(--color-text-secondary)]">
              Remember for this session
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
              className="flex-1 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-emerald-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
