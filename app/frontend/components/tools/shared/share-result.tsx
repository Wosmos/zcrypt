"use client";

import type { ComponentType } from "react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { QRShare } from "@/components/ui/qr-code";
import {
  Shield, Copy, Check, Clock, Link2, AlertTriangle, CheckCircle2,
} from "@/lib/icons";
import { EXPIRY_OPTIONS } from "./expiry";

type IconComponent = ComponentType<{ className?: string; size?: number }>;

/**
 * The "done" success panel shared by pad-tool and send-tool: header, copyable
 * share link, QR code, expiry / burn / E2E badges, and a reset action. Only the
 * title, subtitle, and reset button icon + label differ between the two.
 *
 * The caller owns the `copied` flag / reset-timer and passes `onCopy`.
 */
export function ShareResult({
  title,
  subtitle,
  shareUrl,
  copied,
  onCopy,
  expiryHours,
  burnAfterRead,
  resetIcon: ResetIcon,
  resetLabel,
  onReset,
}: {
  title: string;
  subtitle: string;
  shareUrl: string;
  copied: boolean;
  onCopy: () => void;
  expiryHours: number;
  burnAfterRead: boolean;
  resetIcon: IconComponent;
  resetLabel: string;
  onReset: () => void;
}) {
  return (
    <div className="p-6 space-y-5">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-cyan-500/10">
          <CheckCircle2 className="h-6 w-6 text-cyan-500" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">{subtitle}</p>
        </div>
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
          <Link2 className="h-3.5 w-3.5" /> Share Link
        </label>
        <div className="flex gap-2">
          <div className="flex-1 p-3 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] text-xs font-mono break-all select-all leading-relaxed">{shareUrl}</div>
          <IconButton
            icon={copied ? Check : Copy}
            label={copied ? "Copied" : "Copy link"}
            variant="secondary"
            onClick={onCopy}
            className="flex-shrink-0 self-start"
            iconClassName={copied ? "h-4 w-4 text-cyan-500" : "h-4 w-4"}
          />
        </div>
      </div>
      <QRShare url={shareUrl} />
      <div className="flex gap-2 text-[10px] text-[var(--color-text-muted)]">
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
          <Clock className="h-3 w-3" /> Expires in {EXPIRY_OPTIONS.find(o => o.hours === expiryHours)?.label || `${expiryHours}h`}
        </span>
        {burnAfterRead && (
          <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-500">
            <AlertTriangle className="h-3 w-3" /> Burns after read
          </span>
        )}
        <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
          <Shield className="h-3 w-3" /> E2E encrypted
        </span>
      </div>
      <Button variant="secondary" onClick={onReset} className="w-full">
        <ResetIcon className="h-4 w-4 mr-2" /> {resetLabel}
      </Button>
    </div>
  );
}
