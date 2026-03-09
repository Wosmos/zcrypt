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
import {
  Play,
  Shield,
  Video,
  Sun,
  Moon,
  LayoutGrid,
  Rocket,
  Globe,
  Lock,
  Layers,
  UploadCloud,
  Cpu,
  Search,
  Bluetooth,
  Eye,
  Volume2,
  Music,
  MonitorSmartphone,
} from "lucide-react";
import { useTheme } from "@/components/providers/theme-provider";

// ─── Sizes ─────────────────────────────────────────────────
const IFRAME_LOGICAL_W = 1280;
const IFRAME_LOGICAL_H = 780;
const IPAD_LOGICAL_W = 1024;
const IPAD_LOGICAL_H = 768;
const TRAFFIC_LIGHTS_W = 52; // 3*12 + 2*8 px

// ─── useIsMobile hook ──────────────────────────────────────
function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return isMobile;
}

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
      className="flex items-center gap-2 shrink-0"
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
}: {
  apps: DockApp[];
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
          label: "Try Demo",
          active: false,
          gradient: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
          onClick: () => window.open("/demo", "_blank"),
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
          style={
            { width: size, height: size } as unknown as React.CSSProperties
          }
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
              className="flex items-center px-3.5 py-2 rounded-t-[10px]"
              style={{
                background: "linear-gradient(180deg, #3a3a3c 0%, #2c2c2e 100%)",
                borderBottom: "0.5px solid rgba(0,0,0,0.4)",
              }}
            >
              <TrafficLights onClose={onClose} />
              <span className="flex-1 text-center text-[11px] text-gray-400 font-medium">
                zpush — Demo
              </span>
              <div style={{ width: TRAFFIC_LIGHTS_W }} className="shrink-0" />
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

// ─── Website Modal ─────────────────────────────────────────
function WebsiteModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center p-4 pointer-events-auto"
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
            className="relative w-[95%] h-[90%] max-w-5xl flex flex-col pointer-events-auto"
            initial={{ scale: 0.9, opacity: 0, y: 50 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 50 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 32,
              mass: 0.7,
            }}
            style={{
              borderRadius: 10,
              boxShadow:
                "0 24px 80px -12px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.1)",
              background: "#ffffff",
              overflow: "hidden",
            }}
          >
            <div
              className="flex items-center px-3.5 py-2 shrink-0"
              style={{
                background: "linear-gradient(180deg, #e5e5ea 0%, #d1d1d6 100%)",
                borderBottom: "1px solid rgba(0,0,0,0.15)",
              }}
            >
              <TrafficLights onClose={onClose} />
              <div className="flex-1 flex justify-center">
                <div className="bg-white text-black text-[11px] px-8 py-1.5 rounded-md shadow-sm border border-black/10 flex items-center gap-2">
                  <Shield className="w-3 h-3 text-gray-500" />
                  zpush.com
                </div>
              </div>
              <div style={{ width: TRAFFIC_LIGHTS_W }} className="shrink-0" />
            </div>
            <div className="flex-1 w-full bg-white relative">
              <iframe src="/" className="w-full h-full border-none" />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Easter Egg Modal ──────────────────────────────────────
function EasterEggModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
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
            className="relative w-[70%] max-w-lg"
            initial={{ scale: 0.15, opacity: 0, y: 180 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.15, opacity: 0, y: 180 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 32,
              mass: 0.7,
            }}
            style={{
              borderRadius: 10,
              boxShadow:
                "0 24px 80px -12px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.1)",
              background: "rgba(30, 30, 30, 0.85)",
              backdropFilter: "blur(20px)",
              overflow: "hidden",
            }}
          >
            <div
              className="flex items-center px-3.5 py-2 rounded-t-[10px]"
              style={{
                background:
                  "linear-gradient(180deg, rgba(60,60,60,0.6) 0%, rgba(40,40,40,0.6) 100%)",
                borderBottom: "0.5px solid rgba(0,0,0,0.4)",
              }}
            >
              <TrafficLights onClose={onClose} />
              <span className="flex-1 text-center text-[11px] text-gray-300 font-mono">
                zpush_secrets.sh
              </span>
              <div style={{ width: TRAFFIC_LIGHTS_W }} className="shrink-0" />
            </div>
            <div className="p-6 font-mono text-xs text-green-400 h-[250px] overflow-auto flex flex-col justify-end">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                <p>$ ./zpush_secrets.sh</p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1 }}
                  className="mt-2 text-blue-400"
                >
                  Loading classified data...
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2 }}
                  className="mt-1 text-yellow-400"
                >
                  Decrypting mainframe...
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 3, type: "spring" }}
                  className="mt-4 text-white text-center"
                >
                  <span className="text-4xl block mb-2">🚀</span>
                  <span className="font-bold text-sm tracking-wider uppercase text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-blue-500">
                    You found the secret!
                  </span>
                  <p className="mt-2 text-emerald-400 font-normal">
                    Antigravity FTW.
                  </p>
                </motion.div>
                <div className="flex items-center gap-2 mt-4 text-gray-400">
                  <span className="animate-pulse">_</span>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── About This Mac Modal ──────────────────────────────────
function AboutThisMacModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50 flex items-center justify-center p-4"
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
            className="relative w-[65%] max-w-sm"
            initial={{ scale: 0.9, opacity: 0, y: 30 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 30 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 32,
              mass: 0.7,
            }}
            style={{
              borderRadius: 12,
              boxShadow:
                "0 24px 80px -12px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.1)",
              background: "rgba(30,30,30,0.92)",
              backdropFilter: "blur(40px)",
              overflow: "hidden",
            }}
          >
            {/* Title bar */}
            <div
              className="flex items-center px-3.5 py-2"
              style={{
                background:
                  "linear-gradient(180deg, rgba(60,60,60,0.6) 0%, rgba(40,40,40,0.6) 100%)",
                borderBottom: "0.5px solid rgba(0,0,0,0.4)",
              }}
            >
              <TrafficLights onClose={onClose} />
              <span className="flex-1 text-center text-[11px] text-gray-400 font-medium">
                About This Mac
              </span>
              <div style={{ width: TRAFFIC_LIGHTS_W }} className="shrink-0" />
            </div>

            {/* Wallpaper header */}
            <div
              className="h-28 relative overflow-hidden"
              style={{
                background:
                  "linear-gradient(135deg, #1a1a4e 0%, #0d2847 30%, #0a3d2f 60%, #1a4a3a 100%)",
              }}
            >
              {/* Sequoia-style orbs */}
              <div
                className="absolute w-32 h-32 rounded-full blur-[40px] -top-8 left-1/4"
                style={{ background: "rgba(99,102,241,0.3)" }}
              />
              <div
                className="absolute w-28 h-28 rounded-full blur-[35px] top-2 right-1/4"
                style={{ background: "rgba(16,185,129,0.25)" }}
              />
              <div
                className="absolute w-20 h-20 rounded-full blur-[30px] bottom-0 left-1/2 -translate-x-1/2"
                style={{ background: "rgba(245,158,11,0.15)" }}
              />
              {/* Monitor silhouette */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex flex-col items-center opacity-60">
                <div
                  className="w-16 h-10 rounded-[3px]"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    boxShadow: "0 0 0 1px rgba(255,255,255,0.1)",
                  }}
                />
                <div
                  className="w-3 h-2"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                />
                <div
                  className="w-8 h-1 rounded-b-sm"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                />
              </div>
            </div>

            {/* System info */}
            <div className="px-6 py-5 text-center space-y-1">
              <h3 className="text-[17px] font-semibold text-white tracking-tight">
                macOS Sequoia
              </h3>
              <p className="text-[11px] text-gray-500">Version 15.3.1</p>

              {/* Info grid */}
              <div className="grid grid-cols-[auto_1fr] gap-y-2.5 gap-x-4 text-[11px] mt-4 text-left pt-3">
                <span className="text-gray-500">Chip</span>
                <span className="text-gray-300">Apple M4 Max</span>
                <span className="text-gray-500">Memory</span>
                <span className="text-gray-300">128 GB Unified Memory</span>
                <span className="text-gray-500">Startup Disk</span>
                <span className="text-gray-300">zpush Vault</span>
                <span className="text-gray-500">Serial Number</span>
                <span className="text-gray-300 font-mono text-[10px]">
                  ZP-2026-E2EE
                </span>
                <span className="text-gray-500">macOS</span>
                <span className="text-gray-300">Sequoia 15.3.1 (24D70)</span>
              </div>

              {/* Encryption badge */}
              <div className="flex justify-center pt-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                  <Lock className="w-3 h-3 text-emerald-400" />
                  <span className="text-[10px] text-emerald-400 font-medium">
                    AES-256-GCM Encrypted
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-3 border-t border-white/5 mt-3">
                <p className="text-[10px] text-gray-600">
                  Powered by zpush v0.2 — Zero-Knowledge Vault
                </p>
                <div className="flex justify-center gap-3 mt-2">
                  <button className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
                    Software Update...
                  </button>
                  <button className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors">
                    More Info...
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Spotlight Overlay ─────────────────────────────────────
const SPOTLIGHT_RESULTS = [
  { icon: Shield, label: "zpush Vault", subtitle: "Application" },
  { icon: Lock, label: "AES-256-GCM Encryption", subtitle: "Security" },
  {
    icon: Layers,
    label: "project-backup-2026.tar.gz",
    subtitle: "2.5 GB — Encrypted",
  },
  {
    icon: UploadCloud,
    label: "Upload Pipeline",
    subtitle: "Compress → Encrypt → Chunk → Push",
  },
  { icon: Globe, label: "zpush.io", subtitle: "Website" },
  { icon: Cpu, label: "zstd Compression", subtitle: "Pipeline Stage" },
  {
    icon: MonitorSmartphone,
    label: "System Preferences",
    subtitle: "Application",
  },
];

function SpotlightOverlay({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const filtered = query
    ? SPOTLIGHT_RESULTS.filter((r) =>
        r.label.toLowerCase().includes(query.toLowerCase()),
      )
    : SPOTLIGHT_RESULTS.slice(0, 5);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          <div className="absolute inset-0" onClick={onClose} />
          <motion.div
            className="absolute left-1/2 -translate-x-1/2 w-[55%] max-w-md"
            style={{ top: 45 }}
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.15 }}
          >
            <div
              className="rounded-xl overflow-hidden"
              style={{
                background: "rgba(30,30,32,0.92)",
                backdropFilter: "blur(40px) saturate(1.8)",
                boxShadow:
                  "0 24px 80px -12px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.1)",
              }}
            >
              {/* Search input */}
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-white/[0.06]">
                <Search className="w-4 h-4 text-gray-500 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Spotlight Search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 bg-transparent text-[13px] text-white placeholder-gray-500 outline-none"
                />
              </div>

              {/* Results */}
              {filtered.length > 0 && (
                <div className="py-1.5 max-h-[240px] overflow-auto">
                  <p className="px-3 py-1 text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                    Top Results
                  </p>
                  {filtered.map((result) => {
                    const Icon = result.icon;
                    return (
                      <button
                        key={result.label}
                        onClick={onClose}
                        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-blue-500/20 transition-colors text-left"
                      >
                        <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center shrink-0">
                          <Icon className="w-3.5 h-3.5 text-gray-400" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] text-gray-200 truncate">
                            {result.label}
                          </p>
                          <p className="text-[10px] text-gray-500 truncate">
                            {result.subtitle}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              {query && filtered.length === 0 && (
                <div className="py-6 text-center">
                  <p className="text-[12px] text-gray-500">No results found</p>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Control Center Panel ──────────────────────────────────
function ControlCenterPanel({
  open,
  onClose,
  online,
}: {
  open: boolean;
  onClose: () => void;
  online: boolean;
}) {
  const [wifiOn, setWifiOn] = useState(true);
  const [bluetoothOn, setBluetoothOn] = useState(true);
  const [focusOn, setFocusOn] = useState(false);
  const [brightness, setBrightness] = useState(75);
  const [volume, setVolume] = useState(50);

  useEffect(() => {
    setWifiOn(online);
  }, [online]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.1 }}
        >
          <div className="absolute inset-0" onClick={onClose} />
          <motion.div
            className="absolute right-3 w-[200px]"
            style={{ top: 30 }}
            initial={{ opacity: 0, scale: 0.9, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -8 }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 30,
              mass: 0.5,
            }}
          >
            <div
              className="rounded-2xl overflow-hidden p-2.5 space-y-2"
              style={{
                background: "rgba(30,30,32,0.88)",
                backdropFilter: "blur(40px) saturate(1.8)",
                boxShadow:
                  "0 24px 80px -12px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.1)",
              }}
            >
              {/* Toggle grid */}
              <div className="grid grid-cols-2 gap-2">
                {/* Wi-Fi */}
                <button
                  onClick={() => setWifiOn((v) => !v)}
                  className="flex items-center gap-2 p-2.5 rounded-xl transition-colors"
                  style={{
                    background: wifiOn
                      ? "rgba(59,130,246,0.3)"
                      : "rgba(255,255,255,0.06)",
                  }}
                >
                  <WifiIcon online={wifiOn} className="w-3.5 h-auto text-white" />
                  <div className="text-left">
                    <p className="text-[9px] font-medium text-white">Wi-Fi</p>
                    <p className="text-[8px] text-gray-400">
                      {wifiOn ? "Home" : "Off"}
                    </p>
                  </div>
                </button>

                {/* Bluetooth */}
                <button
                  onClick={() => setBluetoothOn((v) => !v)}
                  className="flex items-center gap-2 p-2.5 rounded-xl transition-colors"
                  style={{
                    background: bluetoothOn
                      ? "rgba(59,130,246,0.3)"
                      : "rgba(255,255,255,0.06)",
                  }}
                >
                  <Bluetooth className="w-3.5 h-3.5 text-white" />
                  <div className="text-left">
                    <p className="text-[9px] font-medium text-white">
                      Bluetooth
                    </p>
                    <p className="text-[8px] text-gray-400">
                      {bluetoothOn ? "On" : "Off"}
                    </p>
                  </div>
                </button>

                {/* AirDrop */}
                <button
                  className="flex items-center gap-2 p-2.5 rounded-xl transition-colors"
                  style={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <LayoutGrid className="w-3.5 h-3.5 text-white" />
                  <div className="text-left">
                    <p className="text-[9px] font-medium text-white">AirDrop</p>
                    <p className="text-[8px] text-gray-400">Everyone</p>
                  </div>
                </button>

                {/* Focus */}
                <button
                  onClick={() => setFocusOn((v) => !v)}
                  className="flex items-center gap-2 p-2.5 rounded-xl transition-colors"
                  style={{
                    background: focusOn
                      ? "rgba(139,92,246,0.3)"
                      : "rgba(255,255,255,0.06)",
                  }}
                >
                  <Eye className="w-3.5 h-3.5 text-white" />
                  <div className="text-left">
                    <p className="text-[9px] font-medium text-white">Focus</p>
                    <p className="text-[8px] text-gray-400">
                      {focusOn ? "On" : "Off"}
                    </p>
                  </div>
                </button>
              </div>

              {/* Brightness slider */}
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/[0.04]">
                <Sun className="w-3 h-3 text-yellow-400 shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={brightness}
                  onChange={(e) => setBrightness(Number(e.target.value))}
                  className="flex-1 h-1 appearance-none rounded-full bg-white/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md cursor-pointer"
                />
              </div>

              {/* Volume slider */}
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-white/[0.04]">
                <Volume2 className="w-3 h-3 text-gray-400 shrink-0" />
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="flex-1 h-1 appearance-none rounded-full bg-white/10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-md cursor-pointer"
                />
              </div>

              {/* Now Playing */}
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-white/[0.04]">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Music className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] font-medium text-white truncate">
                    Encrypting Your Data
                  </p>
                  <p className="text-[8px] text-gray-400 truncate">zpush</p>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Menu Bar Dropdown ─────────────────────────────────────
const MENUS: Record<string, string[]> = {
  File: [
    "New Vault",
    "Open Vault...",
    "---",
    "Import Keys",
    "Export Keys",
    "---",
    "Close Window",
  ],
  Edit: ["Undo", "Redo", "---", "Cut", "Copy", "Paste", "---", "Select All"],
  View: [
    "as Grid",
    "as List",
    "---",
    "Show Sidebar",
    "Toggle Full Screen",
  ],
  Window: ["Minimize", "Zoom", "---", "zpush Vault"],
  Help: [
    "zpush Help",
    "---",
    "Report an Issue",
    "What's New in zpush",
    "---",
    "Keyboard Shortcuts",
  ],
};

function MenuBarDropdown({
  menu,
  onClose,
  anchorLeft,
}: {
  menu: string | null;
  onClose: () => void;
  anchorLeft: number;
}) {
  const items = menu ? MENUS[menu] : null;
  return (
    <AnimatePresence>
      {items && (
        <motion.div
          className="absolute z-50"
          style={{ top: 25, left: anchorLeft }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.1 }}
        >
          {/* Click-away */}
          <div className="fixed inset-0" onClick={onClose} />
          <div
            className="relative min-w-[160px] py-1 rounded-lg overflow-hidden"
            style={{
              background: "rgba(40,40,42,0.95)",
              backdropFilter: "blur(30px) saturate(1.5)",
              boxShadow:
                "0 12px 40px -8px rgba(0,0,0,0.5), 0 0 0 0.5px rgba(255,255,255,0.08)",
            }}
          >
            {items.map((item, i) =>
              item === "---" ? (
                <div
                  key={`sep-${i}`}
                  className="h-px bg-white/[0.06] my-1 mx-2"
                />
              ) : (
                <button
                  key={item}
                  onClick={onClose}
                  className="w-full text-left px-3 py-1 text-[11px] text-gray-300 hover:bg-blue-500/30 hover:text-white transition-colors"
                >
                  {item}
                </button>
              ),
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── Scaled App iFrame ─────────────────────────────────────
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
            pointerEvents: scale > 0 ? "auto" : "none",
          }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      )}
    </div>
  );
}

// ─── Scaled iPad iFrame ────────────────────────────────────
function ScaledIPadFrame({ visible }: { visible: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width;
      setScale(w / IPAD_LOGICAL_W);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const scaledH = Math.round(IPAD_LOGICAL_H * scale);

  return (
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
            width: IPAD_LOGICAL_W,
            height: IPAD_LOGICAL_H,
            border: "none",
            transformOrigin: "top left",
            transform: `scale(${scale})`,
            pointerEvents: scale > 0 ? "auto" : "none",
          }}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        />
      )}
    </div>
  );
}

// ─── iPad Frame (mobile) ───────────────────────────────────
function IPadShowcase({
  isInView,
  time,
  online,
  battery,
}: {
  isInView: boolean;
  time: string;
  online: boolean;
  battery: { level: number; charging: boolean; supported: boolean };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative mx-auto max-w-md"
    >
      {/* Ambient glow */}
      <div className="absolute -inset-8 pointer-events-none">
        <div
          className="absolute inset-0 rounded-[30px] opacity-30"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(16,185,129,0.15) 0%, transparent 60%)",
          }}
        />
      </div>

      {/* iPad bezel */}
      <div
        className="relative rounded-[24px] p-3"
        style={{
          background:
            "linear-gradient(180deg, #3a3a3c 0%, #2a2a2c 40%, #1e1e20 100%)",
          boxShadow: [
            "0 40px 80px -20px rgba(0,0,0,0.6)",
            "inset 0 1px 0 rgba(255,255,255,0.12)",
            "inset 0 -1px 0 rgba(0,0,0,0.5)",
            "0 0 0 1px rgba(0,0,0,0.7)",
          ].join(", "),
        }}
      >
        {/* Front camera (landscape = top center, like real iPad) */}
        <div
          className="absolute top-1.5 left-1/2 -translate-x-1/2 flex items-center justify-center"
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "radial-gradient(circle at 40% 35%, rgba(60,60,65,1) 0%, rgba(25,25,28,1) 100%)",
            boxShadow:
              "0 0 0 1.5px rgba(0,0,0,0.7), 0 0 0 2.5px rgba(50,50,55,0.5), inset 0 1px 2px rgba(0,0,0,0.6)",
          }}
        >
          {/* Lens */}
          <div
            style={{
              width: 4,
              height: 4,
              borderRadius: "50%",
              background: "radial-gradient(circle at 35% 30%, rgba(45,50,65,0.9) 0%, rgba(15,15,20,1) 70%)",
              boxShadow: "inset 0 0.5px 1px rgba(255,255,255,0.08), 0 0 3px rgba(0,0,0,0.4)",
            }}
          />
        </div>

        {/* Screen area */}
        <div
          className="rounded-[12px] overflow-hidden relative"
          style={{
            background: "#0a0a0a",
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.04), inset 0 2px 8px rgba(0,0,0,0.8)",
          }}
        >
          {/* iPadOS status bar */}
          <div
            className="relative z-30 flex items-center justify-between h-[20px] px-4"
            style={{
              background: "rgba(20,20,22,0.80)",
              backdropFilter: "blur(30px) saturate(1.8)",
              borderBottom: "0.5px solid rgba(255,255,255,0.06)",
            }}
          >
            <span className="text-[9px] text-gray-400 font-medium tabular-nums">
              {time}
            </span>
            <div className="flex items-center gap-[8px] text-gray-400">
              <WifiIcon online={online} className="h-[10px] w-auto" />
              {battery.supported ? (
                <BatteryFrame
                  level={battery.level}
                  charging={battery.charging}
                />
              ) : (
                <BatteryFrame level={0.92} charging={false} />
              )}
            </div>
          </div>

          {/* Wallpaper orbs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              className="absolute w-[300px] h-[300px] -top-20 -right-10 rounded-full blur-[80px]"
              style={{ background: "rgba(16,185,129,0.04)" }}
            />
            <div
              className="absolute w-[200px] h-[200px] -bottom-20 -left-10 rounded-full blur-[60px]"
              style={{ background: "rgba(59,130,246,0.03)" }}
            />
          </div>

          {/* iPad iframe */}
          <ScaledIPadFrame visible={isInView} />
        </div>

        {/* Home indicator */}
        <div className="flex justify-center mt-2 mb-0.5">
          <div className="h-[4px] w-[90px] rounded-full bg-white/15" />
        </div>
      </div>

      {/* Ground shadow for iPad */}
      <div className="flex justify-center mt-2">
        <div
          style={{
            width: 160,
            height: 6,
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(0,0,0,0.25) 0%, transparent 70%)",
            borderRadius: "50%",
          }}
        />
      </div>
    </motion.div>
  );
}

// ─── Main macOS Showcase ───────────────────────────────────
export function MacOSShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-80px" });
  const battery = useBatteryStatus();
  const online = useNetworkStatus();
  const isMobile = useIsMobile();

  // Modal/overlay state
  const [videoOpen, setVideoOpen] = useState(false);
  const [websiteOpen, setWebsiteOpen] = useState(false);
  const [easterEggOpen, setEasterEggOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [controlCenterOpen, setControlCenterOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Menu bar label refs for dropdown positioning
  const menuRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [menuAnchorLeft, setMenuAnchorLeft] = useState(0);

  // Close all overlays
  const closeAll = useCallback(() => {
    setVideoOpen(false);
    setWebsiteOpen(false);
    setEasterEggOpen(false);
    setAboutOpen(false);
    setSpotlightOpen(false);
    setControlCenterOpen(false);
    setActiveMenu(null);
  }, []);

  const openOverlay = useCallback(
    (setter: (v: boolean) => void) => {
      closeAll();
      setter(true);
    },
    [closeAll],
  );

  const handleMenuClick = useCallback(
    (menu: string) => {
      if (activeMenu === menu) {
        setActiveMenu(null);
        return;
      }
      closeAll();
      const el = menuRefs.current[menu];
      if (el) {
        const screenEl = el.closest("[data-screen]");
        if (screenEl) {
          const screenRect = screenEl.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          setMenuAnchorLeft(elRect.left - screenRect.left);
        }
      }
      setActiveMenu(menu);
    },
    [activeMenu, closeAll],
  );

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

  const handlePlayClick = useCallback(
    () => openOverlay(setVideoOpen),
    [openOverlay],
  );
  const handleWebsiteClick = useCallback(
    () => openOverlay(setWebsiteOpen),
    [openOverlay],
  );
  const handleEasterEggClick = useCallback(
    () => openOverlay(setEasterEggOpen),
    [openOverlay],
  );

  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const dockApps: DockApp[] = [
    {
      icon: isDark ? Sun : Moon,
      label: "Toggle Theme",
      active: false,
      gradient: "linear-gradient(135deg, #a78bfa 0%, #7c3aed 100%)",
      onClick: toggleTheme,
    },
    {
      icon: Video,
      label: "Video Demo",
      active: videoOpen,
      gradient: "linear-gradient(135deg, #f43f5e 0%, #be123c 100%)",
      onClick: handlePlayClick,
    },
    {
      icon: Globe,
      label: "Interactive site",
      active: websiteOpen,
      gradient: "linear-gradient(135deg, #60a5fa 0%, #2563eb 100%)",
      onClick: handleWebsiteClick,
    },
    {
      icon: Rocket,
      label: "Top Secret",
      active: easterEggOpen,
      gradient: "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
      onClick: handleEasterEggClick,
      bouncing: true,
    },
  ];

  // ── iPad (mobile) ──────────────────────────────────────
  if (isMobile) {
    return (
      <div ref={containerRef} className="relative">
        <IPadShowcase
          isInView={isInView}
          time={time}
          online={online}
          battery={battery}
        />
      </div>
    );
  }

  // ── iMac (desktop) ─────────────────────────────────────
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
              {/* Screen / desktop area */}
              <div
                className="relative"
                data-screen
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

                {/* Wallpaper orbs */}
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
                    <button
                      onClick={() => openOverlay(setAboutOpen)}
                      className="cursor-pointer hover:opacity-100 transition-opacity"
                    >
                      <AppleLogo className="h-[11px] w-[11px] opacity-90" />
                    </button>
                    <span className="font-semibold text-[11.5px]">zpush</span>
                    {Object.keys(MENUS).map((m) => (
                      <button
                        key={m}
                        ref={(el) => {
                          menuRefs.current[m] = el;
                        }}
                        onClick={() => handleMenuClick(m)}
                        className={`text-gray-400 font-normal cursor-pointer hover:text-gray-200 transition-colors ${activeMenu === m ? "text-gray-200" : ""}`}
                      >
                        {m}
                      </button>
                    ))}
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
                    <button
                      onClick={() => openOverlay(setControlCenterOpen)}
                      className="cursor-pointer hover:opacity-100 transition-opacity"
                    >
                      <ControlCenterIcon className="h-[11px] w-auto opacity-70 hover:opacity-100" />
                    </button>
                    <button
                      onClick={() => openOverlay(setSpotlightOpen)}
                      className="cursor-pointer hover:opacity-100 transition-opacity"
                    >
                      <SpotlightIcon className="h-[12px] w-auto opacity-60 hover:opacity-100" />
                    </button>
                    <span className="text-[11px] tabular-nums">
                      {dateStr}
                      {"  "}
                      {time}
                    </span>
                  </div>
                </div>

                {/* ── REAL APP IFRAME ── */}
                <ScaledAppFrame visible={isInView} />

                {/* ── DOCK ── */}
                <div
                  className="absolute bottom-0 left-0 right-0 z-30 flex justify-center pb-2"
                  style={{ pointerEvents: "none" }}
                >
                  <div style={{ pointerEvents: "auto" }}>
                    <Dock apps={dockApps} />
                  </div>
                </div>

                {/* ── Overlays ── */}
                <VideoModal
                  open={videoOpen}
                  onClose={() => setVideoOpen(false)}
                />
                <WebsiteModal
                  open={websiteOpen}
                  onClose={() => setWebsiteOpen(false)}
                />
                <EasterEggModal
                  open={easterEggOpen}
                  onClose={() => setEasterEggOpen(false)}
                />
                <AboutThisMacModal
                  open={aboutOpen}
                  onClose={() => setAboutOpen(false)}
                />
                <SpotlightOverlay
                  open={spotlightOpen}
                  onClose={() => setSpotlightOpen(false)}
                />
                <ControlCenterPanel
                  open={controlCenterOpen}
                  onClose={() => setControlCenterOpen(false)}
                  online={online}
                />
                <MenuBarDropdown
                  menu={activeMenu}
                  onClose={() => setActiveMenu(null)}
                  anchorLeft={menuAnchorLeft}
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
