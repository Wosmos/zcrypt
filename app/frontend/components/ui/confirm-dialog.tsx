"use client";

import type { ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  /** Controlled open state. */
  open: boolean;
  /** Open-state change handler (close on overlay/cancel/escape). */
  onOpenChange: (open: boolean) => void;
  /** Dialog title. */
  title: string;
  /** Required description for context + accessibility. */
  description: ReactNode;
  /** Confirm button label. Defaults to "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to "Cancel". */
  cancelLabel?: string;
  /** Style the confirm action as destructive (red). */
  destructive?: boolean;
  /** Invoked when the confirm action is pressed. */
  onConfirm: () => void;
  /** Disables actions and shows a spinner on confirm. */
  loading?: boolean;
}

/**
 * Ergonomic wrapper over the alert-dialog primitive for consistent confirm
 * modals: enforces title + description, supports destructive styling, and
 * renders an inline spinner while `loading`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <AlertDialogContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--color-text-secondary)]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={loading}
            className="border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={loading}
            onClick={(e) => {
              // Keep the dialog mounted while the async action runs.
              e.preventDefault();
              onConfirm();
            }}
            className={cn(
              destructive &&
                buttonVariants({ variant: "destructive" }) +
                  " bg-red-500 text-white hover:bg-red-600"
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <LogoSpinner size={14} speed="fast" />
                Working...
              </span>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
