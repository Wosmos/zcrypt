"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toastRemainingMs, useToastStore, type Toast } from "@/store/toast";
import { installAudioUnlock } from "@/lib/sounds";
import { Check, X } from "@/lib/icons";
import { KIND, tint } from "@/components/ui/kind";
import { cn } from "@/lib/utils";

const PILL_VISIBLE = 3;
const GLASS_VISIBLE = 3;
const RING_C = 62.8;

const ENTER = "motion-safe:animate-[toast-in_0.28s_cubic-bezier(0.2,0.8,0.2,1)_both]";

function isUndo(t: Toast) {
  return Boolean(t.undo);
}

function isPill(t: Toast) {
  return (t.type === "success" || t.type === "info") && !isUndo(t);
}

function isGlass(t: Toast) {
  return (t.type === "warning" || t.type === "error") && !isUndo(t);
}

function Dismiss({ toast, className }: { toast: Toast; className?: string }) {
  const tr = useTranslations("ui.toasts");
  const remove = useToastStore((s) => s.remove);
  return (
    <button
      type="button"
      onClick={() => remove(toast.id)}
      aria-label={tr("dismiss", { message: toast.message })}
      className={cn(
        "relative grid h-6 w-6 flex-shrink-0 place-items-center rounded-full before:absolute before:-inset-2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]",
        className,
      )}
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

function Count({ count }: { count: number }) {
  const tr = useTranslations("ui.toasts");
  if (count < 2) return null;
  return (
    <span
      className="ms-1.5 rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums opacity-80"
      style={{ background: "color-mix(in oklab, currentColor 14%, transparent)" }}
      aria-label={tr("times", { count })}
    >
      {`×${count}`}
    </span>
  );
}

function Pill({ toast, depth }: { toast: Toast; depth: number }) {
  const remove = useToastStore((s) => s.remove);
  const kind = KIND[toast.type];
  const Icon = toast.icon ?? (toast.type === "success" ? Check : kind.Icon);
  return (
    <div
      data-toast="pill"
      data-kind={toast.type}
      className={cn(
        "pointer-events-auto flex max-w-[min(92vw,26rem)] items-center gap-2.5 rounded-full bg-[var(--color-text)] py-1.5 ps-2 pe-3 text-[13px] font-medium text-[var(--color-bg)] shadow-[0_10px_30px_-10px_rgba(0,0,0,0.5)] transition-[transform,opacity] duration-300",
        ENTER,
        depth > 0 && "scale-[0.96] opacity-80",
      )}
    >
      <span
        className="grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-full text-[var(--color-on-accent)]"
        style={{ background: kind.color }}
      >
        <Icon className="h-3 w-3" weight="bold" />
      </span>
      <span className="min-w-0 break-words py-0.5 leading-snug">
        {toast.message}
        <Count count={toast.count} />
      </span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            remove(toast.id);
          }}
          className="flex-shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors hover:bg-[color-mix(in_oklab,var(--color-bg)_16%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-bg)]"
          style={{ background: "color-mix(in oklab, var(--color-bg) 10%, transparent)" }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}

function GlassRow({ toast }: { toast: Toast }) {
  const remove = useToastStore((s) => s.remove);
  const kind = KIND[toast.type];
  const Icon = toast.icon ?? kind.Icon;
  return (
    <div
      data-toast="glass"
      data-kind={toast.type}
      className={cn(
        "pointer-events-auto flex items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-[0_14px_40px_-14px_rgba(0,0,0,0.45)] backdrop-blur-xl",
        ENTER,
      )}
      style={{
        background: "color-mix(in oklab, var(--color-surface) 82%, transparent)",
        borderColor:
          toast.type === "error"
            ? tint(kind.color, 45, "var(--color-border)")
            : "var(--color-border)",
      }}
    >
      {toast.thumbnail ? (
        // oxlint-disable-next-line nextjs/no-img-element
        <img
          src={toast.thumbnail}
          alt=""
          className="h-9 w-9 flex-shrink-0 rounded-[10px] object-cover"
        />
      ) : (
        <span
          className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px]"
          style={{ background: tint(kind.color, 16), color: kind.color }}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="break-words text-[13px] font-semibold leading-snug text-[var(--color-text)]">
          {toast.message}
          <Count count={toast.count} />
        </p>
        {toast.detail && (
          <p className="break-words text-xs leading-snug text-[var(--color-text-muted)]">
            {toast.detail}
          </p>
        )}
      </div>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            remove(toast.id);
          }}
          className="relative flex-shrink-0 rounded-md px-1 text-[12.5px] font-semibold text-[var(--color-accent)] before:absolute before:-inset-2 before:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          {toast.action.label}
        </button>
      )}
      <Dismiss
        toast={toast}
        className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
      />
    </div>
  );
}

function UndoRing({ toast }: { toast: Toast }) {
  const tr = useTranslations("ui.toasts");
  const [left, setLeft] = useState(toast.duration);
  useEffect(() => {
    const tick = () => setLeft(toastRemainingMs(toast.id) ?? 0);
    tick();
    const handle = setInterval(tick, 100);
    return () => clearInterval(handle);
  }, [toast.id, toast.lastAt]);
  const seconds = Math.ceil(left / 1000);
  return (
    <span
      role="img"
      aria-label={tr("secondsLeft", { seconds })}
      className="relative grid h-[26px] w-[26px] flex-shrink-0 place-items-center"
    >
      <svg viewBox="0 0 26 26" className="absolute inset-0 -rotate-90 rtl:rotate-90" aria-hidden>
        <circle
          cx="13"
          cy="13"
          r="10"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.2"
          strokeWidth="2"
        />
        <circle
          data-ring
          cx="13"
          cy="13"
          r="10"
          fill="none"
          stroke="var(--toast-inv-accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          strokeDashoffset={RING_C * (1 - left / toast.duration)}
        />
      </svg>
      <span className="text-[11px] font-semibold tabular-nums" aria-hidden>
        {seconds}
      </span>
    </span>
  );
}

function UndoBar({ toast }: { toast: Toast }) {
  const tr = useTranslations("ui.toasts");
  const remove = useToastStore((s) => s.remove);
  return (
    <div
      data-toast="undo"
      className={cn(
        "pointer-events-auto flex items-center gap-3 rounded-2xl bg-[var(--color-text)] py-2.5 ps-4 pe-3 text-[var(--color-bg)] shadow-[0_14px_40px_-14px_rgba(0,0,0,0.55)]",
        ENTER,
      )}
    >
      <div className="min-w-0 flex-1">
        <p className="break-words text-[13px] font-medium leading-snug">
          {toast.message}
          <Count count={toast.count} />
        </p>
        {toast.detail && (
          <p className="break-words text-xs leading-snug opacity-70">{toast.detail}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => {
          toast.undo?.();
          remove(toast.id);
        }}
        className="relative flex-shrink-0 rounded-md px-1 text-[13px] font-semibold before:absolute before:-inset-2 before:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--toast-inv-accent)]"
        style={{ color: "var(--toast-inv-accent)" }}
      >
        {tr("undo")}
      </button>
      <UndoRing toast={toast} />
    </div>
  );
}

/** The one place every toast is drawn: pills, glass rows and the undo bar. */
export function ToastContainer() {
  const tr = useTranslations("ui.toasts");
  const toasts = useToastStore((s) => s.toasts);
  const pause = useToastStore((s) => s.pause);
  const resume = useToastStore((s) => s.resume);
  const removeNewest = useToastStore((s) => s.removeNewest);

  useEffect(() => installAudioUnlock(), []);

  const hasToasts = toasts.length > 0;
  useEffect(() => {
    if (!hasToasts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"]'))
        return;
      removeNewest();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hasToasts, removeNewest]);

  const pills = toasts.filter(isPill);
  const glass = toasts.filter(isGlass);
  const undos = toasts.filter(isUndo);
  const polite = toasts.filter((t) => t.type !== "error");
  const assertive = toasts.filter((t) => t.type === "error");

  const hover = {
    onMouseEnter: pause,
    onMouseLeave: resume,
    onFocusCapture: pause,
    onBlurCapture: resume,
  };

  const visiblePills = pills.slice(-PILL_VISIBLE).reverse();
  const visibleGlass = glass.slice(-GLASS_VISIBLE).reverse();
  const olderPills = pills.length - visiblePills.length;
  const olderGlass = glass.length - visibleGlass.length;

  return (
    <>
      <div aria-live="polite" aria-atomic="false" className="sr-only">
        {polite.map((t) => (
          <div key={t.id}>{t.message}</div>
        ))}
      </div>
      <div role="alert" aria-live="assertive" aria-atomic="false" className="sr-only">
        {assertive.map((t) => (
          <div key={t.id}>{t.message}</div>
        ))}
      </div>

      {visiblePills.length > 0 && (
        <div
          aria-label={tr("label")}
          {...hover}
          className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--safe-bottom,0px)+5.5rem)] z-[100] flex flex-col-reverse items-center gap-2 px-3 md:bottom-24 lg:bottom-6"
        >
          {visiblePills.map((t, i) => (
            <Pill key={t.id} toast={t} depth={i} />
          ))}
          {olderPills > 0 && (
            <span className="pointer-events-auto rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-text-muted)]">
              {`+${olderPills}`}
            </span>
          )}
        </div>
      )}

      {visibleGlass.length > 0 && (
        <div
          aria-label={tr("label")}
          {...hover}
          className="pointer-events-none fixed inset-x-3 top-[calc(var(--safe-top,0px)+0.75rem)] z-[100] flex flex-col gap-2 md:inset-x-auto md:bottom-6 md:end-6 md:top-auto md:w-[380px] md:flex-col-reverse"
        >
          {visibleGlass.map((t) => (
            <GlassRow key={t.id} toast={t} />
          ))}
          {olderGlass > 0 && (
            <span className="pointer-events-auto self-center rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--color-text-muted)]">
              {`+${olderGlass}`}
            </span>
          )}
        </div>
      )}

      {undos.length > 0 && (
        <div
          aria-label={tr("label")}
          {...hover}
          className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--safe-bottom,0px)+5.5rem)] z-[100] flex flex-col gap-2 md:inset-x-auto md:bottom-6 md:start-6 md:w-[360px]"
        >
          {undos.slice(-2).map((t) => (
            <UndoBar key={t.id} toast={t} />
          ))}
        </div>
      )}
    </>
  );
}
