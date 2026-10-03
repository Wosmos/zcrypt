"use client";

import { useCallback, useRef } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X, AlertTriangle, Trash2, Info } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
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
  confirmDisabled?: boolean;
  children?: React.ReactNode;
}

const variantConfig: Record<
  ConfirmVariant,
  {
    icon: typeof Trash2;
    iconBg: string;
    iconColor: string;
    confirmBg: string;
    confirmHover: string;
  }
> = {
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
  confirmDisabled = false,
  children,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const config = variantConfig[variant];
  const Icon = config.icon;

  const handleConfirm = useCallback(() => {
    if (loading || confirmDisabled) return;
    onConfirm();
  }, [loading, confirmDisabled, onConfirm]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
          <DialogPrimitive.Content
            onOpenAutoFocus={(e) => {
              e.preventDefault();
              cancelRef.current?.focus();
            }}
            className="w-full max-w-md mx-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl animate-slide-up focus:outline-none"
          >
            {/* Header */}
            <div className="flex items-start gap-3 p-6 pb-0">
              <div
                className={cn(
                  "flex items-center justify-center h-10 w-10 rounded-xl flex-shrink-0",
                  config.iconBg,
                )}
              >
                <Icon className={cn("h-5 w-5", config.iconColor)} />
              </div>
              <div className="flex-1 min-w-0">
                <DialogPrimitive.Title className="text-sm font-semibold">
                  {title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                  {description}
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                aria-label="Close"
                className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors p-1 -mt-1 flex-shrink-0"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            {/* Details */}
            {details && (
              <div className="mx-6 mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5">
                <p className="text-xs text-[var(--color-text-muted)] font-mono leading-relaxed">
                  {details}
                </p>
              </div>
            )}

            {children}

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
                disabled={loading || confirmDisabled}
                className={cn(
                  "flex-1 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50",
                  config.confirmBg,
                )}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <LogoSpinner size={14} speed="fast" />
                    Processing...
                  </span>
                ) : (
                  confirmLabel
                )}
              </button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
