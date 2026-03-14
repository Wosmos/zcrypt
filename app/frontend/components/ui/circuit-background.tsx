"use client";

import { useTheme } from "@/components/providers/theme-provider";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const CIRCUITS = [
  // col 1 (x=40)
  {
    path: "M 40,-50 V 150 L 80,190 V 450 L 40,490 V 850",
    ends: [],
    delay: 0.5,
    duration: 6,
    dir: "normal" as const,
  },
  {
    path: "M 80,850 V 600 L 120,560 V 250 L 80,210 V -50",
    ends: [],
    delay: 1.2,
    duration: 7,
    dir: "reverse" as const,
  },
  {
    path: "M 120,100 L 160,140 V 350",
    ends: [
      [120, 100],
      [160, 350],
    ],
    delay: 0.2,
    duration: 4,
    dir: "normal" as const,
  },
  {
    path: "M 160,400 V 550 L 200,590 V 700",
    ends: [
      [160, 400],
      [200, 700],
    ],
    delay: 2.1,
    duration: 5,
    dir: "normal" as const,
  },
  {
    path: "M 200,-50 V 200 L 240,240 V 350",
    ends: [[240, 350]],
    delay: 3.4,
    duration: 4,
    dir: "normal" as const,
  },
  {
    path: "M 240,850 V 500 L 280,460 V 300 L 240,260 V 150",
    ends: [[240, 150]],
    delay: 1.1,
    duration: 5,
    dir: "reverse" as const,
  },
  {
    path: "M 280,100 V 200 L 320,240 V 450 L 280,490 V 650",
    ends: [
      [280, 100],
      [280, 650],
    ],
    delay: 2.8,
    duration: 7,
    dir: "normal" as const,
  },
  {
    path: "M 320,-50 V 150 L 360,190 V 550 L 320,590 V 850",
    ends: [],
    delay: 0.7,
    duration: 9,
    dir: "normal" as const,
  },
  {
    path: "M 360,850 V 700 L 400,660 V 400",
    ends: [[400, 400]],
    delay: 1.5,
    duration: 4,
    dir: "reverse" as const,
  },
  {
    path: "M 400,150 L 440,190 V 300 L 480,340 V 500",
    ends: [
      [400, 150],
      [480, 500],
    ],
    delay: 4.1,
    duration: 6,
    dir: "normal" as const,
  },
  {
    path: "M 440,-50 V 100 L 480,140 V 250",
    ends: [[480, 250]],
    delay: 0.9,
    duration: 4,
    dir: "normal" as const,
  },
  {
    path: "M 480,850 V 650 L 520,610 V 400 L 480,360 V 200 L 520,160 V -50",
    ends: [],
    delay: 2.2,
    duration: 8,
    dir: "reverse" as const,
  },
  {
    path: "M 520,250 V 350 L 560,390 V 500 L 520,540 V 650",
    ends: [
      [520, 250],
      [520, 650],
    ],
    delay: 3.3,
    duration: 6,
    dir: "normal" as const,
  },
  {
    path: "M 560,-50 V 200 L 600,240 V 400 L 560,440 V 850",
    ends: [],
    delay: 1.8,
    duration: 7,
    dir: "normal" as const,
  },
  {
    path: "M 600,850 V 600 L 640,560 V 300",
    ends: [[640, 300]],
    delay: 0.4,
    duration: 5,
    dir: "reverse" as const,
  },
  {
    path: "M 640,-50 V 150 L 680,190 V 450 L 640,490 V 850",
    ends: [],
    delay: 2.9,
    duration: 8,
    dir: "normal" as const,
  },
  {
    path: "M 680,550 V 650 L 720,690 V 850",
    ends: [[680, 550]],
    delay: 0.6,
    duration: 4,
    dir: "normal" as const,
  },
  {
    path: "M 720,-50 V 250 L 760,290 V 500 L 720,540 V 700",
    ends: [[720, 700]],
    delay: 3.8,
    duration: 7,
    dir: "normal" as const,
  },
  {
    path: "M 760,850 V 750 L 800,710 V 400 L 760,360 V 150",
    ends: [[760, 150]],
    delay: 1.6,
    duration: 6,
    dir: "reverse" as const,
  },
  {
    path: "M 800,200 V 300 L 840,340 V 500",
    ends: [
      [800, 200],
      [840, 500],
    ],
    delay: 4.5,
    duration: 5,
    dir: "normal" as const,
  },
  {
    path: "M 840,-50 V 200 L 880,240 V 600 L 840,640 V 850",
    ends: [],
    delay: 0.3,
    duration: 8,
    dir: "normal" as const,
  },
  {
    path: "M 880,850 V 750 L 920,710 V 450 L 880,410 V 250",
    ends: [[880, 250]],
    delay: 2.7,
    duration: 7,
    dir: "reverse" as const,
  },
  {
    path: "M 920,100 V 200 L 960,240 V 450 L 920,490 V 700",
    ends: [
      [920, 100],
      [920, 700],
    ],
    delay: 1.0,
    duration: 6,
    dir: "normal" as const,
  },
  {
    path: "M 960,-50 V 150 L 1000,190 V 350 L 960,390 V 850",
    ends: [],
    delay: 3.2,
    duration: 9,
    dir: "normal" as const,
  },
  {
    path: "M 1000,850 V 550 L 1040,510 V 350",
    ends: [[1040, 350]],
    delay: 0.8,
    duration: 4,
    dir: "reverse" as const,
  },
  {
    path: "M 1040,150 L 1080,190 V 300 L 1120,340 V 600",
    ends: [
      [1040, 150],
      [1120, 600],
    ],
    delay: 2.5,
    duration: 6,
    dir: "normal" as const,
  },
  {
    path: "M 1080,-50 V 100 L 1120,140 V 250",
    ends: [[1120, 250]],
    delay: 4.2,
    duration: 4,
    dir: "normal" as const,
  },
  {
    path: "M 1120,850 V 750 L 1160,710 V 450 L 1120,410 V 250 L 1160,210 V -50",
    ends: [],
    delay: 1.4,
    duration: 8,
    dir: "reverse" as const,
  },
  {
    path: "M 60,150 V 250 L 100,290 V 450",
    ends: [
      [60, 150],
      [100, 450],
    ],
    delay: 3.6,
    duration: 5,
    dir: "normal" as const,
  },
  {
    path: "M 420,-50 V 150 L 380,190 V 400",
    ends: [[380, 400]],
    delay: 0.1,
    duration: 4,
    dir: "normal" as const,
  },
  {
    path: "M 660,600 V 700 L 620,740 V 850",
    ends: [[660, 600]],
    delay: 2.3,
    duration: 4,
    dir: "normal" as const,
  },
  {
    path: "M 820,-50 V 50 L 860,90 V 150",
    ends: [[860, 150]],
    delay: 4.8,
    duration: 3,
    dir: "normal" as const,
  },
  {
    path: "M 1060,550 V 650 L 1020,690 V 850",
    ends: [[1060, 550]],
    delay: 1.7,
    duration: 5,
    dir: "normal" as const,
  },
];

export function CircuitBackground() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  const isDark = resolvedTheme === "dark";

  return (
    <div className="fixed inset-0 -z-50 overflow-hidden pointer-events-none bg-[var(--color-bg)] transition-colors duration-500">
      <svg
        className="absolute inset-0 w-full h-full opacity-50 dark:opacity-60"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Faint background static traces */}
        <g
          stroke={isDark ? "rgba(0,213,228,0.12)" : "rgba(0,213,228,0.08)"}
          fill="none"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          {CIRCUITS.map((circuit, i) => (
            <g key={`static-${i}`}>
              <path d={circuit.path} />
              {circuit.ends.map((end, j) => (
                <circle
                  key={`node-${i}-${j}`}
                  cx={end[0]}
                  cy={end[1]}
                  r="3"
                  fill={
                    isDark ? "rgba(0,213,228,0.12)" : "rgba(0,213,228,0.08)"
                  }
                  stroke="none"
                />
              ))}
            </g>
          ))}
        </g>

        {/* Animated flowing pulses - Removed Heavy SVG Blur Filter, heavily reduced stroke width & opacity */}
        <g
          stroke={isDark ? "rgba(0,213,228,0.45)" : "rgba(0,213,228,0.3)"}
          fill="none"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          {CIRCUITS.map((circuit, i) => (
            <g key={`anim-${i}`}>
              <path
                d={circuit.path}
                // pathLength=100 lets us animate percentage-based dashes easily
                pathLength="100"
                strokeDasharray="15 100"
                className="animate-circuit-flow"
                style={
                  {
                    "--duration": `${circuit.duration}s`,
                    "--delay": `${circuit.delay}s`,
                    "--dir": circuit.dir,
                  } as React.CSSProperties
                }
              />
            </g>
          ))}
        </g>
      </svg>

      {/* Grid overlay for texture */}
      <div
        className="absolute inset-0 opacity-[0.02] dark:opacity-[0.03]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
          backgroundSize: "24px 24px",
        }}
      />

      {/* Vignette effect - increased fade to keep the center clean */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? "radial-gradient(ellipse at center, transparent 30%, var(--color-bg) 90%)"
            : "radial-gradient(ellipse at center, transparent 30%, rgba(240,245,255,0.98) 90%)",
        }}
      />
    </div>
  );
}
