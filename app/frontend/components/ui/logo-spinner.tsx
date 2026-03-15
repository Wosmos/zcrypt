"use client";

import { useEffect, useRef } from "react";

const CIPHER_CHARS = "#$@&%!?><{}[]|~^*+=0123456789abcdef";

const SIZE_MAP = { xs: 16, sm: 24, md: 40, lg: 64, xl: 88 } as const;
const SPEED_MAP = { fast: 2, default: 3.2, slow: 4.5 } as const;

interface LogoSpinnerProps {
  size?: number | keyof typeof SIZE_MAP;
  speed?: keyof typeof SPEED_MAP;
  className?: string;
}

export function LogoSpinner({
  size = "md",
  speed = "slow",
  className,
}: LogoSpinnerProps) {
  const textRef = useRef<SVGTextElement>(null);
  const px = typeof size === "number" ? size : SIZE_MAP[size];
  const dur = SPEED_MAP[speed];
  const durMs = dur * 1000;
  const showGlow = px >= 32;
  const showAmbient = px >= 56;

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;

    const scrambleStart = durMs * 0.22;
    const scrambleEnd = durMs * 0.38;
    const fadeOut = durMs * 0.88;
    const start = performance.now();
    let raf: number;

    function tick(now: number) {
      const elapsed = (now - start) % durMs;
      if (elapsed >= scrambleStart && elapsed < scrambleEnd) {
        el!.textContent =
          CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
      } else if (elapsed >= scrambleEnd && elapsed < fadeOut) {
        el!.textContent = "z";
      } else if (elapsed < scrambleStart) {
        el!.textContent = "";
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(raf);
  }, [durMs]);

  return (
    <div
      className={className}
      style={
        {
          width: px,
          height: px,
          position: "relative",
          "--cd-dur": `${dur}s`,
        } as React.CSSProperties
      }
    >
      {showAmbient && <div className="cd-ambient" />}
      <svg
        width={px}
        height={px}
        viewBox="0 0 88 88"
        style={{ overflow: "visible" }}
      >
        {/* Back plane */}
        {showGlow && (
          <rect
            className="cd-glow cd-glow-back"
            x="2"
            y="4"
            width="48"
            height="48"
            rx="11"
          />
        )}
        <rect
          className="cd-stroke cd-stroke-back"
          x="2"
          y="4"
          width="48"
          height="48"
          rx="11"
        />
        <rect
          className="cd-fill-back"
          x="2"
          y="4"
          width="48"
          height="48"
          rx="11"
        />
        {/* Front plane */}
        {showGlow && (
          <rect
            className="cd-glow cd-glow-front"
            x="30"
            y="28"
            width="48"
            height="48"
            rx="11"
          />
        )}
        <rect
          className="cd-stroke cd-stroke-front"
          x="30"
          y="28"
          width="48"
          height="48"
          rx="11"
        />
        <rect
          className="cd-fill-front"
          x="30"
          y="28"
          width="48"
          height="48"
          rx="11"
        />
        {/* Cipher z */}
        <text
          ref={textRef}
          className="cd-cipher-z"
          x="54"
          y="59"
          textAnchor="middle"
          fontSize="22"
        >
          z
        </text>
      </svg>
    </div>
  );
}
