"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

type DisplayMode = "percent" | "speed" | "eta";

interface ProgressBarProps {
  percent: number;
  stage?: string;
  eta?: string;
  bytesProcessed?: number;
  totalBytes?: number;
  startedAt?: number;
  variant?: "default" | "accent" | "success";
  className?: string;
}

const barColors = {
  default: "bg-[var(--color-text-muted)]",
  accent: "bg-indigo-500",
  success: "bg-emerald-500",
};

const modeLabels: Record<DisplayMode, string> = {
  percent: "%",
  speed: "Speed",
  eta: "ETA",
};

function formatSpeed(bytesProcessed: number, startedAt: number): string {
  const elapsed = (Date.now() - startedAt) / 1000;
  if (elapsed < 1 || bytesProcessed <= 0) return "--";
  const bps = bytesProcessed / elapsed;
  if (bps >= 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bps >= 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

function formatEtaFromProgress(startedAt: number, percent: number): string {
  if (percent <= 1 || percent >= 100) return "--";
  const elapsed = (Date.now() - startedAt) / 1000;
  if (elapsed < 2) return "--";
  const total = elapsed / (percent / 100);
  const remaining = Math.max(0, total - elapsed);
  if (remaining < 60) return `${Math.ceil(remaining)}s`;
  if (remaining < 3600) return `${Math.ceil(remaining / 60)}m ${Math.ceil(remaining % 60)}s`;
  const h = Math.floor(remaining / 3600);
  const m = Math.ceil((remaining % 3600) / 60);
  return `${h}h ${m}m`;
}

export function ProgressBar({
  percent,
  stage,
  eta,
  bytesProcessed,
  totalBytes,
  startedAt,
  variant = "accent",
  className,
}: ProgressBarProps) {
  const [mode, setMode] = useState<DisplayMode>("percent");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const real = Math.min(100, Math.max(0, Math.round(percent)));

  const cycleMode = () => {
    setMode((m) => m === "percent" ? "speed" : m === "speed" ? "eta" : "percent");
  };

  const getDisplayValue = (): string => {
    switch (mode) {
      case "percent":
        return `${real}%`;
      case "speed":
        if (bytesProcessed && startedAt) return formatSpeed(bytesProcessed, startedAt);
        return `${real}%`;
      case "eta":
        if (startedAt) return formatEtaFromProgress(startedAt, real);
        if (eta) return eta;
        return `${real}%`;
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {(stage || true) && (
        <div className="flex justify-between text-[11px] text-[var(--color-text-secondary)] mb-1.5">
          <span className="capitalize font-medium">{stage}</span>
          <div className="relative flex items-center gap-1">
            <button
              onClick={cycleMode}
              className="flex items-center gap-0.5 tabular-nums hover:text-[var(--color-text)] transition-colors px-1 py-0.5 rounded hover:bg-[var(--color-surface-1)]"
              title={`Showing: ${modeLabels[mode]}. Click to switch.`}
            >
              <span>{getDisplayValue()}</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-50" />
            </button>
          </div>
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-[var(--color-surface-2)] overflow-hidden">
        <div
          className="relative h-full rounded-full transition-[width] duration-300 ease-out overflow-hidden"
          style={{ width: `${Math.max(real, 1)}%` }}
        >
          <div className={cn("absolute inset-0", barColors[variant])} />

          {real < 100 && (
            <div
              className="absolute inset-0 animate-progress-shimmer"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.25) 50%, transparent 100%)",
                backgroundSize: "200% 100%",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
