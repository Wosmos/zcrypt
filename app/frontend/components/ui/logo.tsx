"use client";

import { useState, useId } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Superellipse (squircle) clip path using SVG.
 * Works in all browsers/WebViews — no corner-shape required.
 * n=5 matches the iOS icon shape.
 */
function SquircleClipPath({ id, size }: { id: string; size: number }) {
  const n = 5;
  const steps = 120;
  const r = size / 2;
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const angle = (2 * Math.PI * i) / steps;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = r + r * Math.sign(cos) * Math.pow(Math.abs(cos), 2 / n);
    const y = r + r * Math.sign(sin) * Math.pow(Math.abs(sin), 2 / n);
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return (
    <svg width="0" height="0" style={{ position: "absolute" }}>
      <defs>
        <clipPath id={id} clipPathUnits="userSpaceOnUse">
          <polygon points={points.join(" ")} />
        </clipPath>
      </defs>
    </svg>
  );
}

/**
 * 3D overlap-planes icon rendered with CSS perspective transforms.
 * Two squircle planes with depth — front one carries the "z".
 * On hover: layers merge together + glassy shine sweeps across.
 */
function LogoIcon({
  size = 36,
  hover = true,
  className,
}: {
  size?: number;
  hover?: boolean;
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  const [isHovered, setIsHovered] = useState(false);
  const active = hover && isHovered;

  const plane = Math.round(size * 0.58);
  const tz = Math.max(3, Math.round(size * 0.09));
  const hoverTz = Math.max(1, Math.round(tz * 0.25));
  const ease = "all 0.5s cubic-bezier(0.33, 1, 0.68, 1)";
  const clipId = `sq-${uid}`;
  const clipUrl = `url(#${clipId})`;

  return (
    <span
      className={cn("relative inline-block flex-shrink-0", hover && "cursor-pointer", className)}
      style={{ width: size, height: size, perspective: 600, transformStyle: "preserve-3d" }}
      aria-hidden="true"
      onMouseEnter={() => hover && setIsHovered(true)}
      onMouseLeave={() => hover && setIsHovered(false)}
    >
      {/* Shared squircle clip definition */}
      <SquircleClipPath id={clipId} size={plane} />

      {/* Soft shadow */}
      <span
        className="absolute"
        style={{
          width: plane,
          height: plane,
          top: active ? Math.round(size * 0.2) : Math.round(size * 0.27),
          left: active ? Math.round(size * 0.16) : Math.round(size * 0.21),
          borderRadius: Math.round(plane * 0.3),
          background: active ? "rgba(0,213,228,0.22)" : "rgba(0,147,163,0.15)",
          filter: active ? "blur(16px)" : "blur(10px)",
          transition: ease,
        }}
      />

      {/* Back plane — darker teal */}
      <span
        className="absolute"
        style={{
          width: plane,
          height: plane,
          top: active ? Math.round(size * 0.11) : Math.round(size * 0.04),
          left: active ? Math.round(size * 0.11) : 0,
          clipPath: clipUrl,
          background: "linear-gradient(145deg, #008a97, #006d77)",
          boxShadow: "-2px 3px 10px rgba(0,0,0,0.5)",
          transform: active
            ? `rotateY(-4deg) rotateX(2deg) translateZ(-${hoverTz}px)`
            : `rotateY(-14deg) rotateX(7deg) translateZ(-${tz}px)`,
          transition: ease,
        }}
      />

      {/* Front plane — brand cyan */}
      <span
        className="absolute flex items-center justify-center overflow-hidden"
        style={{
          width: plane,
          height: plane,
          top: active ? Math.round(size * 0.16) : Math.round(size * 0.21),
          left: active ? Math.round(size * 0.25) : Math.round(size * 0.33),
          clipPath: clipUrl,
          background: "linear-gradient(145deg, #00e8f8, #00c5d4)",
          boxShadow: active
            ? "-8px 8px 30px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.2) inset, 0 0 20px rgba(0,213,228,0.15)"
            : "-6px 6px 24px rgba(0,0,0,0.35), 0 1px 0 rgba(255,255,255,0.15) inset",
          transform: active
            ? `rotateY(-4deg) rotateX(2deg) translateZ(${hoverTz}px)`
            : `rotateY(-9deg) rotateX(4deg) translateZ(${tz}px)`,
          transition: ease,
        }}
      >
        {/* Cipher Z mark */}
        <svg
          viewBox="-4 6 150 145"
          width={Math.round(plane * 0.66)}
          height={Math.round(plane * 0.66)}
          fill="currentColor"
          className="text-[#0d2b30] dark:text-[#09090b] mt-[2px] ml-[1.5px]"
          style={{ display: "block" }}
        >
          <path
            d="M16 14 H104 V36 H16 Z
               M104 36 L72 36 L16 94 L48 94 Z
               M16 94 H78 V116 H16 Z"
          />
          <rect x="70" y="92" width="15" height="24" />
          <rect x="90" y="92" width="13" height="13" />
          <rect x="88" y="114" width="9.5" height="9.5" />
          <rect x="107" y="103" width="10.5" height="10.5" />
          <rect x="104" y="122" width="7" height="7" />
          <rect x="121" y="113" width="7" height="7" />
          <rect x="118" y="126" width="5" height="5" />
          <rect x="128" y="124" width="4.5" height="4.5" />
          <rect x="92" y="109" width="4" height="4" />
          <rect x="113" y="120" width="3.6" height="3.6" />
          <rect x="98" y="120" width="3.4" height="3.4" />
          <rect x="126" y="116" width="3.2" height="3.2" />
          <rect x="111" y="132" width="3" height="3" />
          <rect x="123" y="131" width="2.6" height="2.6" />
          <rect x="135" y="121" width="2.6" height="2.6" />
          <rect x="106" y="135" width="2.4" height="2.4" />
          <rect x="133" y="130" width="2.2" height="2.2" />
          <rect x="119" y="138" width="2" height="2" />
          <rect x="129" y="137" width="1.8" height="1.8" />
          <rect x="140" y="128" width="1.8" height="1.8" />
          <rect x="138" y="135" width="1.5" height="1.5" />
          <rect x="124" y="142" width="1.4" height="1.4" />
          <rect x="144" y="134" width="1.2" height="1.2" />
        </svg>
        {/* Glassy shine sweep */}
        {hover && (
          <span
            className="absolute pointer-events-none"
            style={{
              top: "-50%",
              left: active ? "120%" : "-60%",
              width: "40%",
              height: "200%",
              background:
                "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.08) 45%, rgba(255,255,255,0.25) 50%, rgba(255,255,255,0.08) 55%, transparent 70%)",
              transform: "skewX(-15deg)",
              transition: "left 0.6s cubic-bezier(0.33, 1, 0.68, 1)",
            }}
          />
        )}
      </span>
    </span>
  );
}

type LogoSize =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl"
  | "6xl"
  | "7xl"
  | "8xl"
  | "9xl";

const sizeConfig: Record<LogoSize, { icon: number; text: string; dot: string; gap: string }> = {
  xs:   { icon: 24,  text: "text-xs",   dot: "text-[8px]",  gap: "gap-1.5" },
  sm:   { icon: 28,  text: "text-sm",   dot: "text-[9px]",  gap: "gap-2" },
  md:   { icon: 36,  text: "text-base", dot: "text-[10px]", gap: "gap-2.5" },
  lg:   { icon: 44,  text: "text-xl",   dot: "text-xs",     gap: "gap-3" },
  "xl": { icon: 56,  text: "text-3xl",  dot: "text-sm",     gap: "gap-3.5" },
  "2xl":{ icon: 72,  text: "text-4xl",  dot: "text-base",   gap: "gap-4" },
  "3xl":{ icon: 96,  text: "text-5xl",  dot: "text-lg",     gap: "gap-5" },
  "4xl":{ icon: 120, text: "text-6xl",  dot: "text-xl",     gap: "gap-5" },
  "5xl":{ icon: 144, text: "text-7xl",  dot: "text-xl",     gap: "gap-6" },
  "6xl":{ icon: 176, text: "text-8xl",  dot: "text-2xl",    gap: "gap-6" },
  "7xl":{ icon: 208, text: "text-9xl",  dot: "text-2xl",    gap: "gap-7" },
  "8xl":{ icon: 232, text: "text-9xl",  dot: "text-3xl",    gap: "gap-7" },
  "9xl":{ icon: 256, text: "text-9xl",  dot: "text-3xl",    gap: "gap-8" },
};

interface LogoProps {
  size?: LogoSize;
  iconOnly?: boolean;
  showDomain?: boolean;
  className?: string;
  href?: string;
  subtitle?: string;
}

export function Logo({
  size = "md",
  iconOnly = false,
  showDomain = false,
  className,
  href,
  subtitle,
}: LogoProps) {
  const cfg = sizeConfig[size];

  const content = (
    <span className={cn("flex items-center", cfg.gap, className)}>
      <LogoIcon size={cfg.icon} className="flex-shrink-0" />
      {!iconOnly && (
        <span className="flex flex-col min-w-0">
          <span className={cn(cfg.text, "font-bold tracking-tight font-logo leading-none")}>
            <span className="text-[#00d5e4]">z</span>
            <span className="text-[var(--color-text)]">crypt</span>
            {showDomain && (
              <span className={cn(cfg.dot, "text-[var(--color-text-muted)] ml-0.5 font-semibold tracking-wider")}>
                .cloud
              </span>
            )}
          </span>
          {subtitle && (
            <span className="text-[10px] m-1 text-[var(--color-text-muted)]  leading-tight">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} aria-label="zcrypt home" className="inline-flex">
        {content}
      </Link>
    );
  }

  return content;
}

export { LogoIcon };
