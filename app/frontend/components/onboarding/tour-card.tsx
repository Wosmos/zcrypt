"use client";

import { useEffect, useId, useRef } from "react";
import { useTranslations } from "next-intl";
import type { CardComponentProps } from "nextstepjs";

const isTypingTarget = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export function TourCard({
  step,
  currentStep,
  totalSteps,
  nextStep,
  prevStep,
  skipTour,
  arrow,
}: CardComponentProps) {
  const t = useTranslations("ui.tour");
  const nextRef = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const descId = useId();
  const handlers = useRef({ nextStep, prevStep, skipTour });
  useEffect(() => {
    handlers.current = { nextStep, prevStep, skipTour };
  }, [nextStep, prevStep, skipTour]);
  const isLast = currentStep === totalSteps - 1;

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => previous?.focus?.({ preventScroll: true });
  }, []);

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, [currentStep]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handlers.current.skipTour?.();
      } else if (e.key === "Tab") {
        const items = cardRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (!items?.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!cardRef.current?.contains(active)) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      } else if (!isTypingTarget(e.target)) {
        if (e.key === "ArrowRight") handlers.current.nextStep();
        else if (e.key === "ArrowLeft") handlers.current.prevStep();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={cardRef}
      role="dialog"
      aria-modal="true"
      aria-describedby={descId}
      aria-label={t("label", { title: step.title })}
      className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[var(--color-text)] shadow-2xl shadow-black/20"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{step.title}</h2>
        <span className="flex-shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]">
          {t("progress", { current: currentStep + 1, total: totalSteps })}
        </span>
      </div>
      <p
        id={descId}
        aria-live="polite"
        className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]"
      >
        {step.content}
      </p>
      <div className="mt-4 flex items-center justify-between gap-2">
        {isLast ? (
          <span />
        ) : (
          <button
            type="button"
            onClick={() => skipTour?.()}
            className="relative rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--color-text-muted)] before:absolute before:inset-x-0 before:-inset-y-2.5 before:content-[''] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            {t("skip")}
          </button>
        )}
        <div className="flex items-center gap-2">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={prevStep}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              {t("back")}
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={nextStep}
            className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--color-on-accent)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
          >
            {isLast ? t("done") : t("next")}
          </button>
        </div>
      </div>
      {arrow}
    </div>
  );
}
