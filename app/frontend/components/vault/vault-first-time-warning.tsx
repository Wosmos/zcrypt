"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "@/lib/icons";
import { Checkbox } from "@/components/ui/checkbox";

interface VaultFirstTimeWarningProps {
  open: boolean;
  /** The passphrase the user just entered — the re-type must match it exactly. */
  passphrase: string;
  /** Acknowledged: re-type matched AND the box was checked. Commit the passphrase. */
  onConfirm: () => void;
  /** Backed out — return to the unlock modal without setting a passphrase. */
  onCancel: () => void;
}

/**
 * First-time passphrase warning — shown ONCE, on the first unlock of an empty
 * vault (i.e. the moment the user is really SETTING their vault passphrase, since
 * zcrypt has no separate set step). zcrypt is zero-knowledge: the passphrase
 * never leaves this device and can't be recovered, so before it becomes the key
 * that wraps the first file we make the user prove they've got it — re-type it
 * exactly AND tick an explicit acknowledgement. Deliberately heavier than the
 * ordinary unlock modal; this is the one irreversible ceremony in the app.
 *
 * Zero-knowledge: the passphrase is only held in local state to compare against
 * the re-type. It is never logged, never persisted here, and never sent anywhere.
 */
export function VaultFirstTimeWarning({
  open,
  passphrase,
  onConfirm,
  onCancel,
}: VaultFirstTimeWarningProps) {
  const [reentry, setReentry] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset the gates every time the modal opens so a prior attempt never carries
  // over, and focus the re-type field.
  useEffect(() => {
    if (open) {
      setReentry("");
      setAcknowledged(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleCancel = useCallback(() => {
    setReentry("");
    setAcknowledged(false);
    onCancel();
  }, [onCancel]);

  // Escape backs out to the unlock modal.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, handleCancel]);

  if (!open) return null;

  const matches = reentry.length > 0 && reentry === passphrase;
  const mismatch = reentry.length > 0 && !matches;
  const canConfirm = matches && acknowledged;

  const handleConfirm = () => {
    if (!canConfirm) return;
    setReentry("");
    setAcknowledged(false);
    onConfirm();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div
        className="w-full max-w-lg mx-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex items-center justify-center h-11 w-11 rounded-xl bg-amber-500/10 text-amber-500 flex-shrink-0">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold">This passphrase is your only key</h3>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
              Read this before you continue — it only happens once.
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Cancel"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors p-1 -mt-1 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* The warning itself */}
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3.5">
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
            Only you can unlock this vault. Your passphrase never leaves this device
            and is never sent to us — so if you lose it, your files are gone for good.
            No reset, no recovery, no back door. That&apos;s the point.
          </p>
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)] mt-2">
            Write it down somewhere safe, or store it in a password manager, now.
          </p>
        </div>

        {/* Re-type to confirm they actually have it (also catches a first-entry typo) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleConfirm();
          }}
        >
          <label className="mt-5 block text-xs font-medium text-[var(--color-text-secondary)]">
            Re-enter your passphrase to confirm
          </label>
          <input
            ref={inputRef}
            type="password"
            value={reentry}
            onChange={(e) => setReentry(e.target.value)}
            placeholder="Type it again"
            autoComplete="off"
            aria-invalid={mismatch}
            className="mt-1.5 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-3 text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]/40 transition-all"
          />
          {mismatch && (
            <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
              That doesn&apos;t match what you entered. Check it and try again.
            </p>
          )}

          <label className="flex items-start gap-2.5 mt-4 cursor-pointer select-none">
            <Checkbox
              className="mt-0.5"
              checked={acknowledged}
              onCheckedChange={(checked) => setAcknowledged(checked === true)}
            />
            <span className="text-xs leading-relaxed text-[var(--color-text-secondary)]">
              I understand my passphrase can&apos;t be recovered, and no one — not
              even zcrypt — can unlock my files without it.
            </span>
          </label>

          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canConfirm}
              className="flex-1 rounded-xl bg-[#1a1f36] dark:bg-cyan-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-[#252b45] dark:hover:bg-cyan-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              I understand — continue
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
