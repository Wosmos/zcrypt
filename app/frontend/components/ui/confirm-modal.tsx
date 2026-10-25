"use client";

import { useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useLocale, useTranslations } from "next-intl";
import { AlertTriangle, Info, Trash2, X } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { tint } from "@/components/ui/kind";
import type { ToastIcon } from "@/store/toast";
import { cn, formatBytes } from "@/lib/utils";

type ConfirmVariant = "danger" | "warning" | "info";

/** What a destructive action touches, shown as a row of thumbnails and a one line summary. */
export interface ConfirmPreview {
  /** Names of everything affected. The first two are spelled out. */
  names: string[];
  /** Total affected, when more than `names` holds. */
  count?: number;
  /** Combined size in bytes. */
  bytes?: number;
  /** Image URLs for up to four thumbnails. */
  thumbnails?: string[];
}

export interface ConfirmModalProps {
  open: boolean;
  onConfirm: () => void;
  onClose: () => void;
  /** A question that names the count: "Delete 12 files?" */
  title: string;
  description: ReactNode;
  details?: string;
  /** The action named with its count: "Delete 12 files". Never "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  icon?: ToastIcon;
  preview?: ConfirmPreview;
  /** Irreversible actions: the confirm button stays off until this word is typed. */
  typeToConfirm?: string;
  loading?: boolean;
  confirmDisabled?: boolean;
  children?: ReactNode;
}

const VARIANT: Record<ConfirmVariant, { icon: ToastIcon; color: string; button: string }> = {
  danger: {
    icon: Trash2,
    color: "var(--toast-error)",
    button: "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500",
  },
  warning: {
    icon: AlertTriangle,
    color: "var(--toast-warning)",
    button: "bg-amber-500 text-black hover:bg-amber-400 focus-visible:ring-amber-500",
  },
  info: {
    icon: Info,
    color: "var(--color-accent)",
    button:
      "bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:opacity-90 focus-visible:ring-[var(--color-accent)]",
  },
};

function PreviewRow({ preview }: { preview: ConfirmPreview }) {
  const t = useTranslations("ui.confirm");
  const locale = useLocale();
  const total = Math.max(preview.count ?? 0, preview.names.length);
  const shown = preview.names.slice(0, 2);
  const rest = total - shown.length;
  const listed = useMemo(
    () => new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(shown),
    [locale, shown],
  );
  const text = rest > 0 ? t("previewMore", { names: shown.join(", "), count: rest }) : listed;
  const thumbs = (preview.thumbnails ?? []).slice(0, 4);
  return (
    <div
      data-confirm-preview
      className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5"
    >
      {thumbs.length > 0 && (
        <div className="flex flex-shrink-0 -space-x-2 rtl:space-x-reverse">
          {thumbs.map((src) => (
            // oxlint-disable-next-line nextjs/no-img-element
            <img
              key={src}
              src={src}
              alt=""
              className="h-8 w-8 rounded-lg border-2 border-[var(--color-surface)] object-cover"
            />
          ))}
        </div>
      )}
      <p className="min-w-0 break-words text-xs leading-snug text-[var(--color-text-secondary)]">
        {text}
        {preview.bytes !== undefined && (
          <span className="text-[var(--color-text-muted)]">{` · ${formatBytes(preview.bytes)}`}</span>
        )}
      </p>
    </div>
  );
}

/**
 * The one confirmation for destructive or irreversible actions. A centred
 * dialog on desktop, a bottom sheet with stacked buttons below the md
 * breakpoint.
 */
export function ConfirmModal({
  open,
  onConfirm,
  onClose,
  title,
  description,
  details,
  confirmLabel,
  cancelLabel,
  variant = "danger",
  icon,
  preview,
  typeToConfirm,
  loading = false,
  confirmDisabled = false,
  children,
}: ConfirmModalProps) {
  const t = useTranslations();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputId = useId();
  const [typed, setTyped] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) setTyped("");
  }
  const config = VARIANT[variant];
  const Icon = icon ?? config.icon;
  const typedOk = !typeToConfirm || typed.trim().toLowerCase() === typeToConfirm.toLowerCase();
  const blocked = loading || confirmDisabled || !typedOk;

  const handleConfirm = useCallback(() => {
    if (blocked) return;
    onConfirm();
  }, [blocked, onConfirm]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && !loading && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm animate-fade-in" />
        <DialogPrimitive.Content
          role="alertdialog"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            cancelRef.current?.focus();
          }}
          className={cn(
            "fixed z-50 border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl animate-slide-up focus:outline-none",
            "inset-x-0 bottom-0 max-h-[90dvh] overflow-y-auto rounded-t-3xl border-b-0 px-5 pb-[calc(var(--safe-bottom,0px)+1.25rem)] pt-2",
            "md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-[26rem] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl md:border-b md:p-6",
          )}
        >
          <div
            data-sheet-handle
            aria-hidden
            className="mx-auto mb-3 h-1 w-10 rounded-full bg-[var(--color-border-strong,var(--color-border))] md:hidden"
          />

          <div className="flex items-start gap-3">
            <span
              className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl"
              style={{ background: tint(config.color, 14), color: config.color }}
            >
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-[15px] font-semibold leading-snug text-[var(--color-text)]">
                {title}
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                {description}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close
              aria-label={t("common.close")}
              className="-mt-1 hidden flex-shrink-0 rounded-md p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text-secondary)] md:block"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </div>

          {preview && <PreviewRow preview={preview} />}

          {details && (
            <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2.5">
              <p className="font-mono text-xs leading-relaxed text-[var(--color-text-muted)]">
                {details}
              </p>
            </div>
          )}

          {children}

          {typeToConfirm && (
            <div className="mt-4">
              <label
                htmlFor={inputId}
                className="mb-1.5 block text-xs text-[var(--color-text-secondary)]"
              >
                {t.rich("ui.confirm.typeToConfirm", {
                  word: typeToConfirm,
                  b: (chunks) => <b className="font-semibold text-[var(--color-text)]">{chunks}</b>,
                })}
              </label>
              <input
                id={inputId}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                disabled={loading}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleConfirm();
                }}
                className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 text-sm text-[var(--color-text)] outline-none focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/30"
              />
            </div>
          )}

          <div className="mt-5 flex flex-col gap-2 md:flex-row-reverse md:justify-start">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={blocked}
              className={cn(
                "rounded-xl px-4 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] disabled:opacity-50 md:py-2.5",
                config.button,
              )}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <LogoSpinner size={14} speed="fast" />
                  {t("ui.processing")}
                </span>
              ) : (
                (confirmLabel ?? t("common.confirm"))
              )}
            </button>
            <button
              ref={cancelRef}
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl px-4 py-3 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] disabled:opacity-50 md:py-2.5"
            >
              {cancelLabel ?? t("common.cancel")}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
