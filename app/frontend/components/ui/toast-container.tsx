"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useToastStore, type ToastType } from "@/store/toast";
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from "@/lib/icons";
import { cn } from "@/lib/utils";

// ─── Deck geometry (ported from the toast.html reference) ─────────────────────
// Newest sits on top; the rest peek up + to the side and recede into the screen
// (3D). Hover the deck (or tap / focus into it) to fan them into a flat 2D list.
const TOP_ROOM = 22; // headroom above the front card
const PEEK_Y = 11; // how far each card behind peeks up (collapsed)
const PEEK_X = 8; // how far each card behind shifts left (collapsed)
const Z_STEP = 65; // depth each card recedes (collapsed)
const GAP = 10; // gap between cards when expanded
const VISIBLE = 3; // cards drawn in the collapsed deck
const MAX = 5; // hard cap on rendered cards (mirrors the store cap)
const DUR = 4000; // must mirror the store's auto-dismiss timer

// SSR-safe layout effect (avoids the useLayoutEffect-on-server warning).
const useIsoLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Per-type treatment: a base colour drives the card's tinted gradient, border,
// chip and drain bar. Colours are theme tokens (light-safe in light mode, bright
// in dark). `info` uses the app accent so it stays on-brand. `assertive` routes
// the message to the assertive vs polite screen-reader announcer.
const TYPE: Record<
  ToastType,
  { color: string; Icon: typeof CheckCircle2; assertive: boolean }
> = {
  success: { color: "var(--toast-success)", Icon: CheckCircle2, assertive: false },
  error: { color: "var(--toast-error)", Icon: AlertCircle, assertive: true },
  info: { color: "var(--color-accent)", Icon: Info, assertive: false },
  warning: { color: "var(--toast-warning)", Icon: AlertTriangle, assertive: true },
};

/** Tinted card gradient + border for a given type colour. */
function cardStyle(color: string): CSSProperties {
  return {
    backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${color} 16%, var(--color-surface)), var(--color-surface) 66%)`,
    borderColor: `color-mix(in srgb, ${color} 34%, var(--color-border))`,
  };
}

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const remove = useToastStore((s) => s.remove);

  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [focused, setFocused] = useState(false);
  const [heights, setHeights] = useState<Record<string, number>>({});
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);

  const expanded = hovered || pinned || focused;

  // Newest first, capped so a burst can't grow an unbounded deck.
  const ordered = [...toasts].slice(-MAX).reverse();
  const total = ordered.length;

  // Measure card heights so the expanded (2D) layout stacks them exactly and the
  // deck container can size itself. Converges in one corrective pass.
  useIsoLayoutEffect(() => {
    const next: Record<string, number> = {};
    let changed = ordered.length !== Object.keys(heights).length;
    for (const t of ordered) {
      const h = nodeRefs.current.get(t.id)?.offsetHeight ?? heights[t.id] ?? 64;
      next[t.id] = h;
      if (heights[t.id] !== h) changed = true;
    }
    if (changed) setHeights(next);
  });

  // Drop transient expand state once the deck empties.
  useEffect(() => {
    if (total === 0 && (pinned || hovered || focused)) {
      setPinned(false);
      setHovered(false);
      setFocused(false);
    }
  }, [total, pinned, hovered, focused]);

  const h = useCallback((id: string) => heights[id] ?? 64, [heights]);

  const toggle = useCallback(() => {
    setPinned((p) => !(hovered || focused || p));
    setHovered(false);
  }, [hovered, focused]);

  // Screen-reader announcements live in two persistent, always-mounted regions
  // OUTSIDE the visual deck (so they exist before text is injected). Each toast
  // is a separate child node, so a new arrival is announced without re-reading
  // the others. The visual cards below are NOT live regions.
  const polite = toasts.filter((t) => !TYPE[t.type].assertive);
  const assertive = toasts.filter((t) => TYPE[t.type].assertive);

  const frontH = total > 0 ? h(ordered[0].id) : 0;
  const deckHeight = expanded
    ? TOP_ROOM + ordered.reduce((s, t) => s + h(t.id) + GAP, 0) - GAP
    : TOP_ROOM + frontH;
  const hidden = total - VISIBLE;

  return (
    <>
      {/* Persistent SR announcers */}
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

      {total > 0 && (
        <div
          ref={containerRef}
          aria-label="Notifications"
          className={cn(
            // Mobile: near-full-width, pinned near the top clear of the notch.
            "fixed top-[calc(env(safe-area-inset-top,0px)+0.75rem)] inset-x-3 z-[100] flex flex-col gap-2",
            // Desktop: compact deck in the top-right.
            "sm:inset-x-auto sm:right-6 sm:top-5 sm:w-[380px]"
          )}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          onFocusCapture={() => setFocused(true)}
          onBlurCapture={(e) => {
            if (!containerRef.current?.contains(e.relatedTarget as Node)) {
              setFocused(false);
            }
          }}
        >
          {/* The 3D deck */}
          <div
            className="relative motion-reduce:![perspective:none] motion-reduce:!transition-none"
            style={{
              height: deckHeight,
              perspective: 1400,
              perspectiveOrigin: "top center",
              transformStyle: "preserve-3d",
              transition: "height .4s cubic-bezier(.22,.61,.36,1)",
            }}
            onClick={toggle}
          >
            {ordered.map((t, i) => {
              const type = TYPE[t.type];
              // Only the front card is interactive when collapsed; expanding
              // reveals the rest. Non-interactive cards are inert — removed from
              // the tab order and the a11y tree, so a keyboard user can never
              // land on the Dismiss button of a card they can't see.
              const interactive = expanded || i === 0;
              let transform: string;
              let opacity = 1;
              if (i === 0) {
                transform = `translateY(${TOP_ROOM}px)`;
              } else if (expanded) {
                const y =
                  TOP_ROOM +
                  ordered.slice(0, i).reduce((s, o) => s + h(o.id) + GAP, 0);
                transform = `translateY(${y}px)`;
              } else {
                const y = TOP_ROOM - i * PEEK_Y;
                transform = `translateY(${y}px) translateX(-${i * PEEK_X}px) translateZ(-${i * Z_STEP}px)`;
                opacity = i < VISIBLE ? 1 : 0;
              }
              const dimmed = !expanded && i >= 1;

              return (
                <div
                  key={t.id}
                  ref={(el) => {
                    if (el) nodeRefs.current.set(t.id, el);
                    else nodeRefs.current.delete(t.id);
                  }}
                  inert={!interactive}
                  aria-hidden={!interactive || undefined}
                  className="absolute inset-x-0 top-0 flex items-start gap-3 overflow-hidden rounded-2xl border p-3 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.6)] motion-reduce:!transition-none"
                  style={{
                    ...cardStyle(type.color),
                    transformOrigin: "top center",
                    transform,
                    opacity,
                    zIndex: total - i,
                    filter: dimmed ? `brightness(${1 - i * 0.06})` : undefined,
                    transition:
                      "transform .4s cubic-bezier(.22,.61,.36,1), opacity .3s ease, filter .3s ease",
                  }}
                >
                  {/* Chip */}
                  <span
                    className="mt-0.5 grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl"
                    style={{
                      background: `color-mix(in srgb, ${type.color} 16%, transparent)`,
                      color: type.color,
                    }}
                  >
                    <type.Icon className="h-[18px] w-[18px]" />
                  </span>

                  {/* Body */}
                  <p className="min-w-0 flex-1 break-words pt-1 text-sm font-medium leading-snug text-[var(--color-text)]">
                    {t.message}
                  </p>

                  {/* Dismiss */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(t.id);
                    }}
                    aria-label={`Dismiss notification: ${t.message}`}
                    className="-mr-0.5 grid h-6 w-6 flex-shrink-0 place-items-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>

                  {/* Countdown drain */}
                  <span
                    aria-hidden
                    className="absolute bottom-0 left-0 h-[3px] w-full origin-left motion-reduce:!animate-none"
                    style={{
                      background: type.color,
                      animation: `toast-drain ${DUR}ms linear forwards`,
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* "N more" bar — mirrors the app; toggles the fan open/closed. */}
          {hidden > 0 && (
            <div className="flex items-center justify-between rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 shadow-[0_8px_20px_-12px_rgba(0,0,0,0.5)]">
              <span className="text-[13px] text-[var(--color-text-secondary)]">
                {expanded ? (
                  "Showing all notifications"
                ) : (
                  <>
                    <b className="font-semibold text-[var(--color-text)]">{hidden} more</b>{" "}
                    notification{hidden > 1 ? "s" : ""}
                  </>
                )}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggle();
                }}
                className="text-[13px] font-semibold text-[var(--color-accent)] transition-opacity hover:opacity-80"
              >
                {expanded ? "Show less" : "Show all"}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
