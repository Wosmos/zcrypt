"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CheckCircle2 } from "@/lib/icons";

/**
 * Terminal status cards shared by the anonymous tool composers (pad / send /
 * transfer). Both render the same centered icon + title + message + action
 * skeleton — success is cyan/CheckCircle2, error is red/AlertTriangle.
 */

/**
 * Error card.
 *
 * `wrapped` reproduces the pad/send composer shape: an outer `p-6` container
 * with the title + message nested in a `<div>` and the message given
 * `mt-1 max-w-xs`. Unwrapped (the default, used by transfer) renders the bare
 * card with the title + message as direct siblings — the caller supplies the
 * surrounding padding.
 */
export function ToolErrorState({
  title,
  message,
  actionLabel = "Try Again",
  onAction,
  wrapped = false,
}: {
  title: string;
  message: ReactNode;
  actionLabel?: string;
  onAction: () => void;
  wrapped?: boolean;
}) {
  const card = (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-red-500/10">
        <AlertTriangle className="h-6 w-6 text-red-500" />
      </div>
      {wrapped ? (
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-xs">{message}</p>
        </div>
      ) : (
        <>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-[var(--color-text-muted)]">{message}</p>
        </>
      )}
      <Button variant="secondary" onClick={onAction} className="mt-2">{actionLabel}</Button>
    </div>
  );

  return wrapped ? <div className="p-6">{card}</div> : card;
}

/**
 * Success card — the bare centered layout used by transfer's "complete" states.
 * The caller supplies the surrounding padding.
 */
export function ToolSuccessState({
  title,
  message,
  actionLabel,
  onAction,
}: {
  title: string;
  message: ReactNode;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-4 text-center">
      <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-cyan-500/10">
        <CheckCircle2 className="h-6 w-6 text-cyan-500" />
      </div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-[var(--color-text-muted)]">{message}</p>
      <Button variant="secondary" onClick={onAction} className="mt-2">{actionLabel}</Button>
    </div>
  );
}
