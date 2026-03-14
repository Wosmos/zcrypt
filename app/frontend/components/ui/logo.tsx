"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * 3D overlap-planes icon rendered with CSS perspective transforms.
 * Two rounded rects with depth — front one carries the "z".
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
  const [isHovered, setIsHovered] = useState(false);
  const active = hover && isHovered;

  const plane = Math.round(size * 0.58);
  const r = Math.min(10, Math.round(plane * 0.22));
  const tz = Math.max(3, Math.round(size * 0.09));
  const hoverTz = Math.max(1, Math.round(tz * 0.25));
  const ease = "all 0.5s cubic-bezier(0.33, 1, 0.68, 1)";

  return (
    <span
      className={cn("relative inline-block flex-shrink-0", hover && "cursor-pointer", className)}
      style={{
        width: size,
        height: size,
        perspective: 600,
        transformStyle: "preserve-3d",
      }}
      aria-hidden="true"
      onMouseEnter={() => hover && setIsHovered(true)}
      onMouseLeave={() => hover && setIsHovered(false)}
    >
      {/* Soft shadow */}
      <span
        className="absolute"
        style={{
          width: plane,
          height: plane,
          top: active ? Math.round(size * 0.2) : Math.round(size * 0.27),
          left: active ? Math.round(size * 0.16) : Math.round(size * 0.21),
          borderRadius: r,
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
          borderRadius: r,
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
          borderRadius: r,
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
        <span
          className="font-heading"
          style={{
            fontSize: Math.round(size * 0.29),
            fontWeight: 700,
            color: "#09090b",
            lineHeight: 1,
          }}
        >
          z
        </span>
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

type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";

const sizeConfig: Record<LogoSize, { icon: number; text: string; dot: string; gap: string }> = {
  xs: { icon: 24, text: "text-xs", dot: "text-[8px]", gap: "gap-1.5" },
  sm: { icon: 28, text: "text-sm", dot: "text-[9px]", gap: "gap-2" },
  md: { icon: 36, text: "text-base", dot: "text-[10px]", gap: "gap-2.5" },
  lg: { icon: 44, text: "text-xl", dot: "text-xs", gap: "gap-3" },
  xl: { icon: 56, text: "text-3xl", dot: "text-sm", gap: "gap-3.5" },
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
            <span className="text-[10px] text-[var(--color-text-muted)] -mt-0.5 leading-tight">
              {subtitle}
            </span>
          )}
        </span>
      )}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex">
        {content}
      </Link>
    );
  }

  return content;
}

export { LogoIcon };
