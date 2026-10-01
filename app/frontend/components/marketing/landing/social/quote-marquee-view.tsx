"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, Quote, Star } from "@/lib/icons";
import type { PublicReview } from "@/lib/public-reviews";
import { SectionHead } from "../section-head";

const MIN_CARDS_PER_LIST = 5;

function QuoteCard({ q, filler }: { q: PublicReview; filler?: boolean }) {
  return (
    <li className="zs-q" aria-hidden={filler ? "true" : undefined}>
      <figure className="zs-qc pv2-ring corner-squircle">
        <div className="zs-qc-top">
          <Quote className="zs-qc-mark" aria-hidden="true" />
          <span className="zs-qc-stars" role="img" aria-label={`${q.rating} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} data-off={n > q.rating ? "" : undefined} />
            ))}
          </span>
        </div>
        <blockquote className="zs-qc-text">
          <p>&ldquo;{q.quote}&rdquo;</p>
        </blockquote>
        <figcaption className="zs-qc-who">
          <span className="zs-qc-av" aria-hidden="true">
            {q.display_name.trim()[0]?.toUpperCase()}
          </span>
          <span className="zs-qc-meta">
            <span className="zs-qc-name">{q.display_name}</span>
          </span>
        </figcaption>
      </figure>
    </li>
  );
}

function Row({
  items,
  label,
  seconds,
  reverse,
}: {
  items: readonly PublicReview[];
  label: string;
  seconds: number;
  reverse?: boolean;
}) {
  const repeats = Math.max(1, Math.ceil(MIN_CARDS_PER_LIST / items.length));
  const cards = (
    <>
      {Array.from({ length: repeats }).flatMap((_, r) =>
        items.map((q, i) => <QuoteCard key={`${r}-${i}`} q={q} filler={r > 0} />),
      )}
    </>
  );
  return (
    <div
      className="zs-row"
      role="region"
      aria-label={label}
      tabIndex={0}
      data-dir={reverse ? "rev" : "fwd"}
      style={{ "--zs-dur": `${seconds}s` } as CSSProperties}
    >
      <div className="zs-track">
        <ul className="zs-list">{cards}</ul>
        <ul className="zs-list zs-clone" aria-hidden="true" inert>
          {cards}
        </ul>
      </div>
    </div>
  );
}

/** Two opposite-running rows of member reviews. */
export function QuoteMarqueeView({
  rowA,
  rowB,
}: {
  rowA: readonly PublicReview[];
  rowB: readonly PublicReview[];
}) {
  const ref = useRef<HTMLElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) delete el.dataset.offscreen;
        else el.dataset.offscreen = "true";
      },
      { rootMargin: "80px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      id="quotes"
      className="pv2-sec zs-cv zs-quotes"
      aria-labelledby="h-quotes"
      data-paused={paused ? "true" : undefined}
    >
      <div className="pv2-wrap">
        <SectionHead
          id="h-quotes"
          eyebrow="What people say"
          title="Kind words"
          lede="Reviews from people who use zcrypt, read by us before they appear here."
        />
        <div className="zs-q-bar">
          <button
            type="button"
            className="zs-round zs-q-pause"
            aria-pressed={paused}
            aria-label={paused ? "Play the quotes" : "Pause the quotes"}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
          </button>
        </div>
      </div>
      <div className="zs-rows">
        <Row items={rowA} label="Reviews, first row" seconds={64} />
        <Row items={rowB} label="Reviews, second row" seconds={80} reverse />
      </div>
    </section>
  );
}
