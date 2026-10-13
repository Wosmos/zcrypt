"use client";

import { useTranslations } from "next-intl";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { CheckCircle2, CloudOff, RefreshCw, SignalLow, WifiOff, Wrench } from "@/lib/icons";
import { useConnectivity } from "@/hooks/useConnectivity";
import type { ConnectionStatus } from "@/store/connectivity";
import { cn } from "@/lib/utils";

type Shown = Exclude<ConnectionStatus, "ok"> | "recovered";

const TONE: Record<Shown, { icon: typeof WifiOff; ring: string; chip: string }> = {
  offline: {
    icon: WifiOff,
    ring: "border-rose-500/30 bg-rose-500/[0.07]",
    chip: "bg-rose-500/15 text-rose-500",
  },
  down: {
    icon: CloudOff,
    ring: "border-amber-500/35 bg-amber-500/[0.08]",
    chip: "bg-amber-500/15 text-amber-500",
  },
  maintenance: {
    icon: Wrench,
    ring: "border-sky-500/30 bg-sky-500/[0.07]",
    chip: "bg-sky-500/15 text-sky-500",
  },
  slow: {
    icon: SignalLow,
    ring: "border-[var(--color-border)] bg-[var(--color-surface-1)]",
    chip: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]",
  },
  recovered: {
    icon: CheckCircle2,
    ring: "border-emerald-500/30 bg-emerald-500/[0.07]",
    chip: "bg-emerald-500/15 text-emerald-500",
  },
};

/** Which state to show right now, or null for nothing. */
function useShown() {
  const c = useConnectivity();
  const shown: Shown | null = c.status !== "ok" ? c.status : c.recovering ? "recovered" : null;
  return { ...c, shown };
}

function Body({
  shown,
  retryIn,
  checking,
  onRetry,
  compact,
}: {
  shown: Shown;
  retryIn: number | null;
  checking: boolean;
  onRetry: () => void;
  compact?: boolean;
}) {
  const t = useTranslations("ui.connection");
  const tone = TONE[shown];
  const Icon = tone.icon;
  const canRetry = shown === "offline" || shown === "down" || shown === "maintenance";

  return (
    <div className="flex items-start gap-3">
      <span
        className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", tone.chip)}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-tight text-[var(--color-text)]">
          {t(`${shown}Title`)}
        </p>
        {!(compact && shown === "recovered") && (
          <p className="mt-0.5 text-xs leading-snug text-[var(--color-text-muted)]">
            {t(`${shown}Body`)}
          </p>
        )}
        {canRetry && (
          <div className="mt-2 flex items-center gap-3 text-xs">
            <button
              type="button"
              onClick={onRetry}
              disabled={checking}
              className="relative inline-flex items-center gap-1.5 rounded-md font-semibold before:absolute before:-inset-x-2 before:-inset-y-3 before:content-[''] text-[var(--color-text)] transition-opacity hover:opacity-80 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", checking && "animate-spin")} aria-hidden />
              {checking ? t("checking") : t("retryNow")}
            </button>
            {!checking && retryIn !== null && retryIn > 0 && (
              <span className="tabular-nums text-[var(--color-text-muted)]">
                {t("retryIn", { seconds: retryIn })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Tells people, without being asked, when their internet is gone or slow, or
 * when zcrypt's servers can't be reached. `floating` pins it top-center over
 * the app; `inline` sits in the auth card above the sign-in buttons.
 */
export function ConnectionBanner({ variant = "floating" }: { variant?: "floating" | "inline" }) {
  const { shown, retryIn, checking, check } = useShown();
  const t = useTranslations("ui.connection");
  const reduce = useReducedMotion();
  const retry = () => void check();
  const live = (
    <div role="status" aria-live="polite" className="sr-only">
      {shown ? `${t(`${shown}Title`)}. ${t(`${shown}Body`)}` : ""}
    </div>
  );

  if (variant === "inline") {
    return (
      <>
        {live}
        <AnimatePresence initial={false}>
          {shown && (
            <motion.div
              key="conn"
              initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden"
            >
              <div className={cn("mb-4 rounded-xl border p-3", TONE[shown].ring)}>
                <Body shown={shown} retryIn={retryIn} checking={checking} onRetry={retry} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(0.75rem+var(--safe-top,0px))] z-[60] flex justify-center px-3">
      {live}
      <AnimatePresence>
        {shown && (
          <motion.div
            key="conn"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -16, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className={cn(
              "pointer-events-auto w-full max-w-md rounded-2xl border p-3 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] backdrop-blur-xl",
              "bg-[var(--color-surface)]/90",
              TONE[shown].ring,
            )}
          >
            <Body shown={shown} retryIn={retryIn} checking={checking} onRetry={retry} compact />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const DOT: Record<ConnectionStatus, string> = {
  ok: "bg-emerald-500",
  slow: "bg-amber-400",
  maintenance: "bg-sky-500",
  down: "bg-amber-500",
  offline: "bg-zinc-400",
};

/** A quiet one-line server status under the sign-in card. */
export function ConnectionStatusPill({ className }: { className?: string }) {
  const t = useTranslations("ui.connection");
  const { status, known } = useConnectivity();
  const label = !known && status === "ok" ? t("pillChecking") : t(`pill.${status}`);

  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]",
        className,
      )}
    >
      <span className="relative flex h-2 w-2">
        {known && status === "ok" && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/50 motion-reduce:animate-none" />
        )}
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            known || status !== "ok" ? DOT[status] : "bg-zinc-400",
          )}
        />
      </span>
      {label}
    </p>
  );
}
