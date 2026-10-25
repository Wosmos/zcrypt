"use client";

import { useTranslations } from "next-intl";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { CheckCircle2, CloudOff, RefreshCw, SignalLow, WifiOff, Wrench } from "@/lib/icons";
import { Banner } from "@/components/ui/banner";
import { useConnectivity } from "@/hooks/useConnectivity";
import type { ConnectionStatus } from "@/store/connectivity";
import { cn, type Severity } from "@/lib/utils";

type Shown = Exclude<ConnectionStatus, "ok"> | "recovered";

const KIND_OF: Record<Shown, { kind: Severity; icon: typeof WifiOff }> = {
  offline: { kind: "error", icon: WifiOff },
  down: { kind: "warning", icon: CloudOff },
  maintenance: { kind: "info", icon: Wrench },
  slow: { kind: "info", icon: SignalLow },
  recovered: { kind: "success", icon: CheckCircle2 },
};

/** Which state to show right now, or null for nothing. */
function useShown() {
  const c = useConnectivity();
  const shown: Shown | null = c.status !== "ok" ? c.status : c.recovering ? "recovered" : null;
  return { ...c, shown };
}

function ConnectionAlert({
  shown,
  retryIn,
  checking,
  onRetry,
  compact,
  className,
}: {
  shown: Shown;
  retryIn: number | null;
  checking: boolean;
  onRetry: () => void;
  compact?: boolean;
  className?: string;
}) {
  const t = useTranslations("ui.connection");
  const { kind, icon } = KIND_OF[shown];
  const canRetry = shown === "offline" || shown === "down" || shown === "maintenance";
  const showRetryIn = canRetry && !checking && retryIn !== null && retryIn > 0;

  return (
    <Banner
      kind={kind}
      icon={icon}
      title={t(`${shown}Title`)}
      body={compact && shown === "recovered" ? undefined : t(`${shown}Body`)}
      className={className}
      actions={
        canRetry
          ? [
              {
                label: checking ? t("checking") : t("retryNow"),
                onClick: onRetry,
                disabled: checking,
                icon: (
                  <RefreshCw
                    className={cn("h-3.5 w-3.5", checking && "animate-spin")}
                    aria-hidden
                  />
                ),
              },
            ]
          : undefined
      }
    >
      {showRetryIn && (
        <p className="mt-0.5 text-xs tabular-nums text-[var(--color-text-muted)]">
          {t("retryIn", { seconds: retryIn })}
        </p>
      )}
    </Banner>
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
              <ConnectionAlert
                shown={shown}
                retryIn={retryIn}
                checking={checking}
                onRetry={retry}
                className="mb-4"
              />
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
            className="pointer-events-auto w-full max-w-md shadow-[0_12px_32px_-12px_rgba(0,0,0,0.35)] rounded-2xl backdrop-blur-xl"
          >
            <ConnectionAlert
              shown={shown}
              retryIn={retryIn}
              checking={checking}
              onRetry={retry}
              compact
            />
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
