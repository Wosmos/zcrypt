"use client";

import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, Trash2, ShieldAlert, Info } from "@/lib/icons";
import { cn } from "@/lib/utils";

type ConfirmVariant = "danger" | "warning" | "info";

interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
  title: string;
  description: string;
  details?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  loading?: boolean;
}

const variantConfig: Record<ConfirmVariant, {
  icon: typeof Trash2;
  iconBg: string;
  iconColor: string;
  confirmBg: string;
  confirmHover: string;
}> = {
  danger: {
    icon: Trash2,
    iconBg: "bg-red-500/10",
    iconColor: "text-red-500",
    confirmBg: "bg-red-500 hover:bg-red-600",
    confirmHover: "hover:bg-red-600",
  },
  warning: {
    icon: AlertTriangle,
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-500",
    confirmBg: "bg-amber-500 hover:bg-amber-600",
    confirmHover: "hover:bg-amber-600",
  },
  info: {
    icon: Info,
    iconBg: "bg-blue-500/10",
    iconColor: "text-blue-500",
    confirmBg: "bg-blue-500 hover:bg-blue-600",
    confirmHover: "hover:bg-blue-600",
  },
};

export function ConfirmModal({
  open,
  onConfirm,
  onClose,
  title,
  description,
  details,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const config = variantConfig[variant];
  const Icon = config.icon;

  useEffect(() => {
    if (open) {
      setTimeout(() => cancelRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const handleConfirm = useCallback(() => {
    if (loading) return;
    onConfirm();
  }, [loading, onConfirm]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md mx-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-3 p-6 pb-0">
          <div className={cn("flex items-center justify-center h-10 w-10 rounded-xl flex-shrink-0", config.iconBg)}>
            <Icon className={cn("h-5 w-5", config.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1 leading-relaxed">
              {description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors p-1 -mt-1 flex-shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Details */}
        {details && (
          <div className="mx-6 mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5">
            <p className="text-xs text-[var(--color-text-muted)] font-mono leading-relaxed">
              {details}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 p-6 pt-5">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              "flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50",
              config.confirmBg
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
