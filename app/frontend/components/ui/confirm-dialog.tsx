"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
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
  /** Confirm button label. Defaults to the translated "Confirm". */
  confirmLabel?: string;
  /** Cancel button label. Defaults to the translated "Cancel". */
  cancelLabel?: string;
  /** Style the confirm action as destructive (red). */
  destructive?: boolean;
  /** Invoked when the confirm action is pressed. */
  onConfirm: () => void;
  /** Disables actions and shows a spinner on confirm. */
  loading?: boolean;
  /** Keeps the confirm action disabled until the extra content is complete. */
  confirmDisabled?: boolean;
  /** Extra content rendered between the description and the actions. */
  children?: ReactNode;
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
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  loading = false,
  confirmDisabled = false,
  children,
}: ConfirmDialogProps) {
  const t = useTranslations("common");
  return (
    <AlertDialog open={open} onOpenChange={loading ? undefined : onOpenChange}>
      <AlertDialogContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-[var(--color-text-secondary)]">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel
            disabled={loading}
            className="border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
          >
            {cancelLabel ?? t("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={loading || confirmDisabled}
            onClick={(e) => {
              // Keep the dialog mounted while the async action runs.
              e.preventDefault();
              onConfirm();
            }}
            className={cn(
              destructive &&
                buttonVariants({ variant: "destructive" }) +
                  " bg-red-500 text-white hover:bg-red-600",
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <LogoSpinner size={14} speed="fast" />
                {t("working")}
              </span>
            ) : (
              (confirmLabel ?? t("confirm"))
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
