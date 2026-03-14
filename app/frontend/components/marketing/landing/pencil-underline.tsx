"use client";

import { motion } from "motion/react";

/**
 * Gel-pen ink-style SVG decoration that animates in with scaleX.
 *
 * Variants:
 * - "ink"       — tapered filled underline, like a gel-pen stroke
 * - "highlight" — wide semi-transparent band with wavy edges
 * - "circle"    — loose oval around the word (low-opacity fill + visible stroke)
 */

function InkBleedFilter() {
  return (
    <svg
      aria-hidden
      style={{ position: "absolute", width: 0, height: 0, visibility: "hidden" as const }}
    >
      <defs>
        <filter id="ink-bleed">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves="3"
            result="noise"
          />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2" />
          <feGaussianBlur stdDeviation="0.3" />
        </filter>
      </defs>
    </svg>
  );
}

let filterRendered = false;

export function PencilUnderline({
  variant = "ink",
  color = "var(--color-accent)",
  className,
  delay = 0.3,
  width = "105%",
}: {
  variant?: "ink" | "highlight" | "circle";
  color?: string;
  className?: string;
  delay?: number;
  width?: string;
}) {
  const showFilter = !filterRendered;
  if (showFilter) filterRendered = true;

  if (variant === "highlight") {
    return (
      <span
        className={`absolute left-[-2%] right-[-2%] -z-10 ${className ?? ""}`}
        style={{ bottom: "2px" }}
      >
        {showFilter && <InkBleedFilter />}
        <svg
          viewBox="0 0 200 20"
          preserveAspectRatio="none"
          style={{ width, height: "0.4em", display: "block" }}
        >
          <motion.path
            d="M0,4 C30,2 60,6 100,3 C140,0 170,5 200,3 L200,17 C170,19 140,14 100,17 C60,20 30,15 0,17 Z"
            fill={color}
            opacity="0.12"
            filter="url(#ink-bleed)"
            style={{ transformOrigin: "left" }}
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
      </span>
    );
  }

  if (variant === "circle") {
    return (
      <span
        className={`absolute -z-10 ${className ?? ""}`}
        style={{ inset: "-10% -8%", pointerEvents: "none" }}
      >
        {showFilter && <InkBleedFilter />}
        <svg
          viewBox="0 0 200 100"
          preserveAspectRatio="none"
          fill="none"
          style={{ width: "100%", height: "100%", display: "block" }}
        >
          <motion.ellipse
            cx="100"
            cy="50"
            rx="92"
            ry="40"
            fill={color}
            fillOpacity="0.05"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.5"
            filter="url(#ink-bleed)"
            transform="rotate(-1.5 100 50)"
            style={{ transformOrigin: "center" }}
            initial={{ scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 0.5 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay, ease: [0.16, 1, 0.3, 1] }}
          />
        </svg>
      </span>
    );
  }

  // Default: ink — tapered filled gel-pen stroke
  return (
    <span
      className={`absolute left-[-2%] right-[-2%] ${className ?? ""}`}
      style={{ bottom: "-5px", pointerEvents: "none" }}
    >
      {showFilter && <InkBleedFilter />}
      <svg
        viewBox="0 0 200 30"
        preserveAspectRatio="none"
        style={{
          width,
          height: "0.22em",
          display: "block",
          filter: "url(#ink-bleed)",
          transform: "rotate(-0.5deg)",
        }}
      >
        <motion.path
          d="M2,18 C40,17 80,19 120,16 C150,14 185,12 196,10 C200,10 202,22 195,24 C150,26 80,24 2,18 Z"
          fill={color}
          opacity="0.65"
          style={{ transformOrigin: "left" }}
          initial={{ scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
    </span>
  );
}

/**
 * Wrapper that places text inline with a PencilUnderline positioned underneath.
 */
export function Underlined({
  children,
  variant = "ink",
  color,
  className,
  delay,
}: {
  children: React.ReactNode;
  variant?: "ink" | "highlight" | "circle";
  color?: string;
  className?: string;
  delay?: number;
}) {
  return (
    <span className={`relative inline-block ${className ?? ""}`}>
      {children}
      <PencilUnderline variant={variant} color={color} delay={delay} />
    </span>
  );
}
