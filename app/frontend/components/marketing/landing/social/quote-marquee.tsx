"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Pause, Play, Quote } from "@/lib/icons";
import { SectionHead } from "../section-head";
import { QUOTE_ROW_A, QUOTE_ROW_B, type SampleQuote } from "./quotes-data";

function QuoteCard({ q }: { q: SampleQuote }) {
  return (
    <li className="zs-q" data-placeholder-testimonial>
      <figure className="zs-qc pv2-ring corner-squircle">
        <div className="zs-qc-top">
          <Quote className="zs-qc-mark" aria-hidden="true" />
          <span className="zs-qc-tag">Sample</span>
        </div>
        <blockquote className="zs-qc-text">
          <p>&ldquo;{q.quote}&rdquo;</p>
        </blockquote>
        <figcaption className="zs-qc-who">
          <span className="zs-qc-av" aria-hidden="true">
            {q.name[0]}
          </span>
          <span className="zs-qc-meta">
            <span className="zs-qc-name">{q.name}</span>
            <span className="zs-qc-role">{q.role}</span>
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
  items: readonly SampleQuote[];
  label: string;
  seconds: number;
  reverse?: boolean;
}) {
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
        <ul className="zs-list">
          {items.map((q) => (
            <QuoteCard key={q.name} q={q} />
          ))}
        </ul>
        <ul className="zs-list zs-clone" aria-hidden="true" inert>
          {items.map((q) => (
            <QuoteCard key={q.name} q={q} />
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Two opposite-running rows of clearly labelled sample quotes. */
export function QuoteMarquee() {
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
          eyebrow="Sample quotes"
          title="Placeholder praise"
          lede="Real people haven't said nice things in writing yet. Give it a minute."
        />
        <div className="zs-q-bar">
          <p className="zs-stag">Sample quotes, not real reviews</p>
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
        <Row items={QUOTE_ROW_A} label="Sample quotes, first row" seconds={64} />
        <Row items={QUOTE_ROW_B} label="Sample quotes, second row" seconds={80} reverse />
      </div>
    </section>
  );
}
