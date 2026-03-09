"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { Play, Shield, Video, Sun, Moon, LayoutGrid } from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";

// ─── Sizes ─────────────────────────────────────────────────
// The iframe renders the real app at this logical width, then
// CSS-scales it down to fit whatever the monitor frame is.
const IFRAME_LOGICAL_W = 1280;
const IFRAME_LOGICAL_H = 780;

// ─── Battery hook ──────────────────────────────────────────
function useBatteryStatus() {
  const [battery, setBattery] = useState({
    charging: false,
    level: 1,
    supported: false,
  });
  useEffect(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    let batt: any = null;
    const update = () => {
      if (!batt) return;
      setBattery({
        charging: batt.charging,
        level: batt.level,
        supported: true,
      });
    };
    if ("getBattery" in navigator) {
      (navigator as any)
        .getBattery()
        .then((b: any) => {
          batt = b;
          update();
          batt.addEventListener("chargingchange", update);
          batt.addEventListener("levelchange", update);
        })
        .catch(() => {});
    }
    /* eslint-enable @typescript-eslint/no-explicit-any */
    return () => {
      if (batt) {
        batt.removeEventListener("chargingchange", update);
        batt.removeEventListener("levelchange", update);
      }
    };
  }, []);
  return battery;
}

// ─── Network hook ──────────────────────────────────────────
function useNetworkStatus() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

// ─── macOS SVG icons ───────────────────────────────────────
function AppleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 384 512" fill="currentColor">
      <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" />
    </svg>
  );
}

function WifiIcon({
  online,
  className,
}: {
  online: boolean;
  className?: string;
}) {
  if (!online) {
    return (
      <svg
        className={className}
        viewBox="0 0 16 14"
        fill="currentColor"
        opacity={0.4}
      >
        <path d="M8 11.5a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z" />
        <path
          d="M5.4 9.3a3.9 3.9 0 015.2 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M3.4 6.6a7.2 7.2 0 019.2 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <path
          d="M.7 4a10.5 10.5 0 0114.6 0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <line
          x1="2"
          y1="1"
          x2="14"
          y2="13"
          stroke="currentColor"
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 16 14" fill="currentColor">
      <path d="M8 11.5a1.2 1.2 0 100 2.4 1.2 1.2 0 000-2.4z" />
      <path
        d="M5.4 9.3a3.9 3.9 0 015.2 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M3.4 6.6a7.2 7.2 0 019.2 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M.7 4a10.5 10.5 0 0114.6 0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BatteryFrame({
  level,
  charging,
}: {
  level: number;
  charging: boolean;
}) {
  const pct = Math.round(level * 100);
  const fillColor = charging
    ? "#34d399"
    : pct > 20
      ? "#f5f5f5"
      : pct > 10
        ? "#fbbf24"
        : "#ef4444";
  return (
    <div className="flex items-center gap-[3px]">
      <svg width="22" height="11" viewBox="0 0 22 11" fill="none">
        <rect
          x="0.5"
          y="0.5"
          width="18"
          height="10"
          rx="2"
          stroke="#9ca3af"
          strokeWidth="1"
        />
        <rect
          x="1.5"
          y="1.5"
          width={Math.max(0, 16 * level)}
          height="8"
          rx="1"
          fill={fillColor}
        />
        <path d="M20 3.5v4a1 1 0 001-1v-2a1 1 0 00-1-1z" fill="#9ca3af" />
        {charging && (
          <path
            d="M10.5 1L7.5 5.5H10L9 10l3.5-5H10L10.5 1z"
            fill="#0a0a0a"
            stroke="#0a0a0a"
            strokeWidth="0.3"
          />
        )}
      </svg>
      <span className="text-[10px] text-gray-400 tabular-nums w-6 text-right">
        {pct}%
      </span>
    </div>
  );
}

function ControlCenterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 14 12" fill="currentColor">
      <rect x="0" y="0" width="6" height="5" rx="1.2" />
      <rect x="8" y="0" width="6" height="5" rx="1.2" />
      <rect x="0" y="7" width="6" height="5" rx="1.2" />
      <rect x="8" y="7" width="6" height="5" rx="1.2" />
    </svg>
  );
}

function SpotlightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
    >
      <circle cx="6" cy="6" r="4.5" />
      <line x1="9.5" y1="9.5" x2="13" y2="13" strokeLinecap="round" />
    </svg>
  );
}

// ─── Traffic Lights ────────────────────────────────────────
function TrafficLights({ onClose }: { onClose?: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      className="flex items-center gap-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClose}
        className="h-[12px] w-[12px] rounded-full bg-[#ff5f57] flex items-center justify-center cursor-pointer"
        style={{ boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12)" }}
      >
        {hovered && (
          <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
            <path
              d="M.5.5l5 5M5.5.5l-5 5"
              stroke="#4a0002"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
      <div
        className="h-[12px] w-[12px] rounded-full bg-[#febc2e] flex items-center justify-center cursor-pointer"
        style={{ boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12)" }}
      >
        {hovered && (
          <svg width="6" height="2" viewBox="0 0 6 2" fill="none">
            <path
              d="M.5 1h5"
              stroke="#995700"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>
      <div
        className="h-[12px] w-[12px] rounded-full bg-[#28c840] flex items-center justify-center cursor-pointer"
        style={{ boxShadow: "inset 0 0 0 0.5px rgba(0,0,0,0.12)" }}
      >
        {hovered && (
          <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
            <path
              d="M1.5 0.5L0.5 0.5L0.5 1.5M4.5 5.5L5.5 5.5L5.5 4.5"
              stroke="#006500"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  );
}

// ─── Dock (decorative, outside the iframe) ─────────────────
const DOCK_ICON_SIZE = 30;
const DOCK_MAGNIFY = 1.55;
const DOCK_DISTANCE = 80;

interface DockApp {
  icon: React.ComponentType<{
    className?: string;
    style?: React.CSSProperties;
  }>;
  label: string;
  active: boolean;
  gradient: string;
  onClick?: () => void;
  bouncing?: boolean;
}

function Dock({
  apps,
  onPlayClick,
}: {
  apps: DockApp[];
  onPlayClick: () => void;
}) {
  const dockRef = useRef<HTMLDivElement>(null);
  const mouseX = useMotionValue(-999);
  return (
    <motion.div
      ref={dockRef}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        mouseX.set(e.clientX - rect.left);
      }}
      onMouseLeave={() => mouseX.set(-999)}
      className="flex items-end gap-[2px] px-2 py-1 rounded-2xl border border-white/[0.08]"
      style={
        {
          background: "rgba(30,30,30,0.55)",
          backdropFilter: "blur(30px) saturate(1.5)",
          boxShadow:
            "0 0 0 0.5px rgba(255,255,255,0.06), inset 0 0.5px 0 rgba(255,255,255,0.05), 0 30px 60px -12px rgba(0,0,0,0.5)",
        } as React.CSSProperties
      }
    >
      {apps.map((app, i) => (
        <DockIcon
          key={app.label}
          app={app}
          mouseX={mouseX}
          dockRef={dockRef}
          index={i}
        />
      ))}
      <div className="w-px h-5 bg-white/10 mx-0.5 self-center" />
      <DockIcon
        app={{
          icon: Play,
          label: "Watch Demo",
          active: false,
          gradient: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
          onClick: onPlayClick,
        }}
        mouseX={mouseX}
        dockRef={dockRef}
        index={apps.length}
        isPlay
      />
    </motion.div>
  );
}

function DockIcon({
  app,
  mouseX,
  dockRef,
  isPlay,
}: {
  app: DockApp;
  mouseX: MotionValue<number>;
  dockRef: React.RefObject<HTMLDivElement | null>;
  index: number;
  isPlay?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);

  const distance = useTransform(mouseX, (val) => {
    const el = ref.current;
    if (!el) return 999;
    const dockEl = dockRef.current;
    if (!dockEl) return 999;
    const buttonRect = el.getBoundingClientRect();
    const dockRect = dockEl.getBoundingClientRect();
    return val - (buttonRect.left - dockRect.left + buttonRect.width / 2);
  });

  const size = useSpring(
    useTransform(
      distance,
      [-DOCK_DISTANCE, 0, DOCK_DISTANCE],
      [DOCK_ICON_SIZE, DOCK_ICON_SIZE * DOCK_MAGNIFY, DOCK_ICON_SIZE],
    ),
    { mass: 0.1, stiffness: 200, damping: 15 },
  );

  const Icon = app.icon;
  return (
    <div className="relative flex flex-col items-center">
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            className="absolute -top-9 z-10 px-2.5 py-1 rounded-[4px] text-[11px] font-medium text-white whitespace-nowrap pointer-events-none"
            style={
              {
                background: "rgba(40,40,40,0.95)",
                boxShadow:
                  "0 2px 8px rgba(0,0,0,0.3), 0 0 0 0.5px rgba(255,255,255,0.08)",
              } as React.CSSProperties
            }
          >
            {app.label}
            <div
              className="absolute left-1/2 -translate-x-1/2 -bottom-[4px] w-2 h-2 rotate-45"
              style={{ background: "rgba(40,40,40,0.95)" }}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        ref={ref}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={app.onClick}
        animate={app.bouncing ? { y: [0, -16, 0, -8, 0] } : {}}
        transition={app.bouncing ? { duration: 0.6, ease: "easeInOut" } : {}}
        className="relative cursor-pointer origin-bottom"
      >
        <motion.div
          style={{ width: size, height: size } as unknown as React.CSSProperties}
          className="rounded-[22%] flex items-center justify-center overflow-hidden"
        >
          <div
            className="w-full h-full rounded-[22%] flex items-center justify-center relative"
            style={{
              background: app.gradient,
              boxShadow:
                "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 -1px 0 rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            <div
              className="absolute inset-0 rounded-[22%] pointer-events-none"
              style={{
                background:
                  "linear-gradient(180deg, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0.05) 40%, transparent 50%)",
              }}
            />
            <Icon
              className={`relative z-10 text-white ${isPlay ? "ml-0.5" : ""}`}
              style={{ width: "45%", height: "45%" }}
            />
          </div>
        </motion.div>
      </motion.button>
      {app.active && (
        <div className="h-[4px] w-[4px] rounded-full bg-white/60 mt-[3px]" />
      )}
    </div>
  );
}

// ─── Video Modal ───────────────────────────────────────────
function VideoModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <div
            className="absolute inset-0"
            onClick={onClose}
            style={{
              background: "rgba(0,0,0,0.45)",
              backdropFilter: "blur(8px)",
            }}
          />
          <motion.div
            className="relative w-[85%] max-w-xl"
            initial={{ scale: 0.15, opacity: 0, y: 180 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.15, opacity: 0, y: 180 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 32,
              mass: 0.7,
            }}
            style={
              {
                borderRadius: 10,
                boxShadow:
                  "0 24px 80px -12px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.1)",
              } as React.CSSProperties
            }
          >
            <div
              className="flex items-center gap-2 px-3.5 py-2 rounded-t-[10px]"
              style={{
                background: "linear-gradient(180deg, #3a3a3c 0%, #2c2c2e 100%)",
                borderBottom: "0.5px solid rgba(0,0,0,0.4)",
              }}
            >
              <TrafficLights onClose={onClose} />
              <span className="flex-1 text-center text-[11px] text-gray-400 font-medium -ml-14">
                zpush — Demo
              </span>
            </div>
            <div
              className="aspect-video flex items-center justify-center rounded-b-[10px]"
              style={{
                background: "linear-gradient(180deg, #1c1c1e 0%, #111113 100%)",
              }}
            >
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    delay: 0.15,
                    type: "spring",
                    stiffness: 400,
                    damping: 20,
                  }}
                  className="inline-flex items-center justify-center h-16 w-16 rounded-full mb-4 cursor-pointer group"
                  style={
                    {
                      background: "rgba(16,185,129,0.12)",
                      border: "1px solid rgba(16,185,129,0.2)",
                    } as React.CSSProperties
                  }
                >
                  <Play className="h-7 w-7 text-emerald-400 ml-1 group-hover:text-emerald-300 transition-colors" />
                </motion.div>
                <p className="text-[13px] text-gray-400 font-medium">
                  Demo coming soon
                </p>
                <p className="text-[11px] text-gray-600 mt-1">
                  Watch zpush encrypt &amp; upload in real-time
                </p>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Scaled App iFrame ─────────────────────────────────────
// Renders the real /dashboard route at IFRAME_LOGICAL_W × IFRAME_LOGICAL_H
// then scales it down to fill whatever width the screen container has.
function ScaledAppFrame({ visible }: { visible: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setScale(w / IFRAME_LOGICAL_W);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const scaledH = Math.round(IFRAME_LOGICAL_H * scale);

  return (
    // Outer div — takes the scaled height, clips overflow
    <div
      ref={wrapRef}
      style={{
        width: "100%",
        height: scaledH,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {visible && (
        <iframe
          src="/demo"
          title="zpush app"
          style={{
            width: IFRAME_LOGICAL_W,
            height: IFRAME_LOGICAL_H,
            border: "none",
            transformOrigin: "top left",
            transform: `scale(${scale})`,
            // pointer events only when scale is sane
            pointerEvents: scale > 0 ? "auto" : "none",
          }}
          // Allow same-origin scripts (needed for Next.js RSC/CSR)
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      )}
    </div>
  );
}

// ─── Main macOS Showcase ───────────────────────────────────
export function MacOSShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-80px" });
  const battery = useBatteryStatus();
  const online = useNetworkStatus();
  const [videoOpen, setVideoOpen] = useState(false);

  const [time, setTime] = useState("");
  const [dateStr, setDateStr] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setTime(
        d.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
      );
      setDateStr(
        d.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
        }),
      );
    };
    tick();
    const id = setInterval(tick, 10_000);
    return () => clearInterval(id);
  }, []);

  const handlePlayClick = useCallback(() => setVideoOpen(true), []);

  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const dockApps: DockApp[] = [
    {
      icon: Shield,
      label: "zpush (Toggle Theme)",
      active: true,
      gradient: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
      onClick: toggleTheme,
      bouncing: true,
    },
    {
      icon: Video,
      label: "Video Demo",
      active: false,
      gradient: "linear-gradient(135deg, #f43f5e 0%, #be123c 100%)",
      onClick: handlePlayClick,
    },
    {
      icon: LayoutGrid,
      label: "Try Live Demo",
      active: false,
      gradient: "linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)",
      onClick: () => {
        window.location.href = "/demo";
      },
    },
    {
      icon: isDark ? Sun : Moon,
      label: "App Theme",
      active: false,
      gradient: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
      onClick: toggleTheme,
    },
  ];

  return (
    <div ref={containerRef} className="relative">
      <motion.div
        initial={{ opacity: 0, y: 50, rotateX: 8 }}
        animate={isInView ? { opacity: 1, y: 0, rotateX: 0 } : {}}
        transition={{ duration: 1, ease: [0.25, 0.46, 0.45, 0.94] }}
        style={{ perspective: 1200 }}
        className="relative mx-auto max-w-4xl"
      >
        {/* Ambient glow */}
        <div className="absolute -inset-12 pointer-events-none">
          <div
            className="absolute inset-0 rounded-[40px] opacity-40"
            style={{
              background:
                "radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.15) 0%, transparent 60%)",
            }}
          />
        </div>

        {/* ── MONITOR FRAME ─────────────────────────── */}
        <div className="relative">
          {/* Outer aluminium bezel */}
          <div
            className="relative rounded-[18px] p-[14px] pb-[10px]"
            style={{
              background:
                "linear-gradient(180deg, #3a3a3c 0%, #2a2a2c 40%, #1e1e20 100%)",
              boxShadow: [
                "0 60px 120px -20px rgba(0,0,0,0.75)",
                "inset 0 1px 0 rgba(255,255,255,0.14)",
                "inset 0 -1px 0 rgba(0,0,0,0.5)",
                "0 0 0 1px rgba(0,0,0,0.7)",
                "inset 0 0 0 1px rgba(255,255,255,0.04)",
              ].join(", "),
            }}
          >
            {/* Inner matte black surround */}
            <div
              className="rounded-[8px] overflow-hidden"
              style={{
                background: "#0a0a0a",
                boxShadow: [
                  "inset 0 0 0 1px rgba(255,255,255,0.04)",
                  "inset 0 2px 8px rgba(0,0,0,0.8)",
                  "inset 0 0 40px rgba(0,0,0,0.4)",
                ].join(", "),
              }}
            >
              {/* Screen / desktop area — position relative so overlays work */}
              <div
                className="relative"
                style={{
                  background:
                    "linear-gradient(135deg, #0c0c1d 0%, #0a1628 30%, #0d1117 60%, #111827 100%)",
                }}
              >
                {/* Screen inner glow */}
                <div
                  className="absolute inset-0 pointer-events-none z-10 rounded-[6px]"
                  style={{
                    boxShadow:
                      "inset 0 0 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)",
                  }}
                />

                {/* Subtle glare */}
                <div
                  className="absolute inset-0 pointer-events-none z-20 rounded-[6px]"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 40%, transparent 60%, rgba(255,255,255,0.01) 100%)",
                  }}
                />

                {/* Wallpaper orbs (visible around iframe edges) */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                  <div
                    className="absolute w-[500px] h-[500px] -top-20 -right-20 rounded-full blur-[100px]"
                    style={{ background: "rgba(16,185,129,0.05)" }}
                  />
                  <div
                    className="absolute w-[400px] h-[400px] -bottom-40 -left-20 rounded-full blur-[80px]"
                    style={{ background: "rgba(59,130,246,0.04)" }}
                  />
                </div>

                {/* ── macOS MENU BAR overlay ── */}
                <div
                  className="relative z-30 flex items-center justify-between h-[25px] px-3"
                  style={{
                    background: "rgba(20,20,22,0.80)",
                    backdropFilter: "blur(30px) saturate(1.8)",
                    borderBottom: "0.5px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <div className="flex items-center gap-[14px] text-[11.5px] text-gray-300">
                    <AppleLogo className="h-[11px] w-[11px] opacity-90" />
                    <span className="font-semibold text-[11.5px]">zpush</span>
                    <span className="text-gray-400 font-normal">File</span>
                    <span className="text-gray-400 font-normal">Edit</span>
                    <span className="text-gray-400 font-normal">View</span>
                    <span className="text-gray-400 font-normal">Window</span>
                    <span className="text-gray-400 font-normal">Help</span>
                  </div>
                  <div className="flex items-center gap-[10px] text-gray-400">
                    <WifiIcon online={online} className="h-[13px] w-auto" />
                    {battery.supported ? (
                      <BatteryFrame
                        level={battery.level}
                        charging={battery.charging}
                      />
                    ) : (
                      <BatteryFrame level={0.85} charging={false} />
                    )}
                    <ControlCenterIcon className="h-[11px] w-auto opacity-70" />
                    <SpotlightIcon className="h-[12px] w-auto opacity-60" />
                    <span className="text-[11px] tabular-nums">
                      {dateStr}
                      {"  "}
                      {time}
                    </span>
                  </div>
                </div>

                {/* ── REAL APP IFRAME ── */}
                <ScaledAppFrame visible={isInView} />

                {/* ── DOCK — pinned to bottom of screen, floating above iframe ── */}
                <div
                  className="absolute bottom-0 left-0 right-0 z-30 flex justify-center pb-2"
                  style={{ pointerEvents: "none" }}
                >
                  <div style={{ pointerEvents: "auto" }}>
                    <Dock apps={dockApps} onPlayClick={handlePlayClick} />
                  </div>
                </div>

                {/* Video modal — overlays the iframe */}
                <VideoModal
                  open={videoOpen}
                  onClose={() => setVideoOpen(false)}
                />
              </div>
            </div>

            {/* Bottom chin with camera */}
            <div className="flex items-center justify-center h-[28px] mt-1">
              <div
                className="h-[5px] w-[5px] rounded-full"
                style={{
                  background: "rgba(30,30,32,0.9)",
                  boxShadow:
                    "0 0 0 1px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.05)",
                }}
              />
            </div>
          </div>

          {/* ── STAND ──────────────────────────── */}
          <div className="flex flex-col items-center">
            {/* Neck */}
            <div
              style={{
                width: 60,
                height: 28,
                background: "linear-gradient(180deg, #2e2e30 0%, #252527 100%)",
                clipPath: "polygon(20% 0%, 80% 0%, 100% 100%, 0% 100%)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              }}
            />
            {/* Base */}
            <div
              style={{
                width: 180,
                height: 10,
                background: "linear-gradient(180deg, #323234 0%, #1c1c1e 100%)",
                borderRadius: "0 0 10px 10px",
                boxShadow:
                  "0 4px 16px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.06) inset, 0 0 0 1px rgba(0,0,0,0.6)",
              }}
            />
            {/* Ground shadow */}
            <div
              style={{
                width: 200,
                height: 6,
                marginTop: 2,
                background:
                  "radial-gradient(ellipse at 50% 0%, rgba(0,0,0,0.35) 0%, transparent 70%)",
                borderRadius: "50%",
              }}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
