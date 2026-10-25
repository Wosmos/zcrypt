"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { X } from "@/lib/icons";
import { KIND, tint } from "@/components/ui/kind";
import type { ToastIcon } from "@/store/toast";
import { cn, type Severity } from "@/lib/utils";

export interface BannerAction {
  label: string;
  onClick?: () => void;
  href?: string;
  variant?: "text" | "outline";
  disabled?: boolean;
  icon?: ReactNode;
}

interface BannerProps {
  kind: Severity;
  title: string;
  /** The one line under the title. */
  body?: string;
  icon?: ToastIcon;
  /** At most two: a text button and an outline button. */
  actions?: BannerAction[];
  onDismiss?: () => void;
  /** Extra content under the text, such as a usage bar. */
  children?: ReactNode;
  /** "alert" interrupts a screen reader; "status" waits its turn. */
  role?: "alert" | "status";
  className?: string;
}

const ACTION_BASE =
  "relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:opacity-50";

function ActionButton({ action, color }: { action: BannerAction; color: string }) {
  const outline = action.variant === "outline";
  const className = cn(
    ACTION_BASE,
    outline
      ? "border hover:bg-[var(--color-surface-2)]"
      : "text-[var(--color-text)] hover:bg-[var(--color-surface-2)]",
  );
  const style = outline ? { borderColor: tint(color, 40, "var(--color-border)") } : undefined;
  const content = (
    <>
      {action.icon}
      {action.label}
    </>
  );
  if (action.href) {
    return (
      <Link href={action.href} className={className} style={style}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled}
      className={className}
      style={style}
    >
      {content}
    </button>
  );
}

/** A condition that stays until it is fixed: offline, storage nearly full, deletion scheduled. */
export function Banner({
  kind,
  title,
  body,
  icon,
  actions,
  onDismiss,
  children,
  role = "status",
  className,
}: BannerProps) {
  const t = useTranslations("ui.banner");
  const { color, Icon: DefaultIcon } = KIND[kind];
  const Icon = icon ?? DefaultIcon;
  return (
    <div
      role={role}
      data-banner={kind}
      className={cn("flex items-center gap-3 rounded-2xl border py-2.5 ps-3 pe-2", className)}
      style={{
        background: tint(color, 8, "var(--color-surface)"),
        borderColor: tint(color, 28, "var(--color-border)"),
      }}
    >
      <span
        className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-[10px] self-start sm:self-center"
        style={{ background: tint(color, 16), color }}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-x-4 gap-y-2 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight text-[var(--color-text)]">{title}</p>
          {body && (
            <p className="mt-0.5 text-xs leading-snug text-[var(--color-text-muted)]">{body}</p>
          )}
          {children}
        </div>
        {actions && actions.length > 0 && (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            {actions.slice(0, 2).map((a) => (
              <ActionButton key={a.label} action={a} color={color} />
            ))}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("dismiss")}
          className="relative grid h-7 w-7 flex-shrink-0 place-items-center self-start rounded-lg text-[var(--color-text-muted)] transition-colors before:absolute before:-inset-1.5 before:content-[''] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] sm:self-center"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
