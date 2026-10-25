"use client";

import type { ReactNode } from "react";
import { ConfirmModal, type ConfirmModalProps } from "@/components/ui/confirm-modal";

interface ConfirmDialogProps
  extends Pick<
    ConfirmModalProps,
    | "title"
    | "confirmLabel"
    | "cancelLabel"
    | "onConfirm"
    | "loading"
    | "confirmDisabled"
    | "children"
    | "icon"
    | "preview"
    | "typeToConfirm"
    | "details"
  > {
  /** Controlled open state. */
  open: boolean;
  /** Open-state change handler (close on overlay/cancel/escape). */
  onOpenChange: (open: boolean) => void;
  /** One explanatory paragraph. */
  description: ReactNode;
  /** Style the confirm action as destructive (red). Otherwise it uses the accent. */
  destructive?: boolean;
  /** Overrides the look when `destructive` is not enough. */
  variant?: ConfirmModalProps["variant"];
}

/**
 * Open-state flavoured wrapper over ConfirmModal, kept for callers that
 * control the dialog with `onOpenChange`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  destructive = false,
  variant,
  ...rest
}: ConfirmDialogProps) {
  return (
    <ConfirmModal
      open={open}
      onClose={() => onOpenChange(false)}
      variant={variant ?? (destructive ? "danger" : "info")}
      {...rest}
    />
  );
}
