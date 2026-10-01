"use client";

import { useEffect, useRef } from "react";
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
  const nextRef = useRef<HTMLButtonElement>(null);
  const handlers = useRef({ nextStep, prevStep, skipTour });
  handlers.current = { nextStep, prevStep, skipTour };
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
      role="dialog"
      aria-label={`Tour: ${step.title}`}
      className="w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-[var(--color-text)] shadow-2xl shadow-black/20"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">{step.title}</h2>
        <span className="flex-shrink-0 text-[11px] tabular-nums text-[var(--color-text-muted)]">
          {currentStep + 1} of {totalSteps}
        </span>
      </div>
      <p
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
            className="rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
          >
            Skip tour
          </button>
        )}
        <div className="flex items-center gap-2">
          {currentStep > 0 && (
            <button
              type="button"
              onClick={prevStep}
              className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium transition-colors hover:bg-[var(--color-surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
            >
              Back
            </button>
          )}
          <button
            ref={nextRef}
            type="button"
            onClick={nextStep}
            className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)]"
          >
            {isLast ? "Done" : "Next"}
          </button>
        </div>
      </div>
      {arrow}
    </div>
  );
}
