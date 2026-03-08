"use client";

import { useState, useEffect } from "react";
import { FileCard } from "@/components/files/file-card";
import { CompactStats } from "@/components/vault/compact-stats";
import { UploadZone } from "@/components/upload/upload-zone";
import { useTheme } from "@/components/providers/theme-provider";
import type { FileMetadata } from "@/types";
import { cn } from "@/lib/utils";
import {
  Shield,
  Settings,
  Sun,
  Moon,
  Info,
  Layers,
  Lock,
  Cpu,
  UploadCloud,
  CheckCircle2,
} from "lucide-react";

// ── Mock vault data ──────────────────────────────────────────────
const MOCK_FILES: FileMetadata[] = [
  {
    id: "f1",
    original_name: "project-backup-2026.tar.gz",
    original_size: 2_453_000_000,
    compressed_size: 1_842_000_000,
    encrypted_size: 1_845_600_000,
    chunk_count: 18,
    sha256: "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
    created_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  },
  {
    id: "f2",
    original_name: "photos-collection-2025.zip",
    original_size: 8_120_000_000,
    compressed_size: 7_980_000_000,
    encrypted_size: 7_985_000_000,
    chunk_count: 62,
    sha256: "b2c3d4e5f6a78901bcdef1234567890abcdef1234567890abcdef1234567890a",
    created_at: new Date(Date.now() - 24 * 3600_000).toISOString(),
  },
  {
    id: "f3",
    original_name: "database-dump-prod.sql",
    original_size: 512_000_000,
    compressed_size: 201_000_000,
    encrypted_size: 202_400_000,
    chunk_count: 2,
    sha256: "c3d4e5f6a7b89012cdef1234567890abcdef1234567890abcdef1234567890ab",
    created_at: new Date(Date.now() - 3 * 24 * 3600_000).toISOString(),
  },
  {
    id: "f4",
    original_name: "design-assets-v4.fig",
    original_size: 340_000_000,
    compressed_size: 318_000_000,
    encrypted_size: 319_500_000,
    chunk_count: 3,
    sha256: "d4e5f6a7b8c90123def1234567890abcdef1234567890abcdef1234567890abc",
    created_at: new Date(Date.now() - 5 * 24 * 3600_000).toISOString(),
  },
  {
    id: "f5",
    original_name: "client-presentation-q1.pptx",
    original_size: 128_000_000,
    compressed_size: 119_000_000,
    encrypted_size: 119_800_000,
    chunk_count: 1,
    sha256: "e5f6a7b8c9d01234ef1234567890abcdef1234567890abcdef1234567890abcd",
    created_at: new Date(Date.now() - 7 * 24 * 3600_000).toISOString(),
  },
];

// ── Animated pipeline stages ─────────────────────────────────────
const PIPELINE_STAGES = [
  { label: "Compressing…", pct: 12, icon: Layers, color: "text-amber-400" },
  { label: "Compressing…", pct: 30, icon: Layers, color: "text-amber-400" },
  {
    label: "Encrypting (AES-256-GCM)…",
    pct: 48,
    icon: Lock,
    color: "text-violet-400",
  },
  {
    label: "Encrypting (AES-256-GCM)…",
    pct: 62,
    icon: Lock,
    color: "text-violet-400",
  },
  {
    label: "Uploading — chunk 4/18",
    pct: 70,
    icon: UploadCloud,
    color: "text-sky-400",
  },
  {
    label: "Uploading — chunk 9/18",
    pct: 79,
    icon: UploadCloud,
    color: "text-sky-400",
  },
  {
    label: "Uploading — chunk 14/18",
    pct: 88,
    icon: UploadCloud,
    color: "text-sky-400",
  },
  {
    label: "Uploading — chunk 18/18",
    pct: 96,
    icon: UploadCloud,
    color: "text-sky-400",
  },
  { label: "Done ✓", pct: 100, icon: CheckCircle2, color: "text-emerald-400" },
] as const;

type DownloadState = "idle" | "downloading" | "done";

const DEMO_UPLOADING_FILE = {
  name: "annual-report-2026.pdf",
  size: "24.6 MB",
};

// ── Sidebar links ────────────────────────────────────────────────
const NAV = [
  { icon: Shield, label: "Vault", active: true },
  { icon: Settings, label: "Settings", active: false },
] as const;

// ── Demo Page ────────────────────────────────────────────────────
export default function DemoClient() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [stageIdx, setStageIdx] = useState(0);
  const [downloadStates, setDownloadStates] = useState<
    Record<string, DownloadState>
  >({});
  const [demoActive, setDemoActive] = useState(true);

  // Cycle through upload pipeline stages
  useEffect(() => {
    if (!demoActive) return;
    const interval = setInterval(() => {
      setStageIdx((i) => {
        const next = (i + 1) % PIPELINE_STAGES.length;
        // Pause 2 s on "done" before resetting
        if (next === 0) clearInterval(interval);
        return next;
      });
    }, 1100);
    return () => clearInterval(interval);
  }, [demoActive]);

  // Auto-restart after "done"
  useEffect(() => {
    if (stageIdx === PIPELINE_STAGES.length - 1) {
      const t = setTimeout(() => {
        setStageIdx(0);
        setDemoActive((v) => !v); // toggle to restart effect
        setDemoActive(true);
      }, 2200);
      return () => clearTimeout(t);
    }
  }, [stageIdx]);

  const handleDemoDownload = (filename: string) => {
    const file = MOCK_FILES.find((f) => f.original_name === filename);
    if (!file || downloadStates[file.id] === "downloading") return;
    setDownloadStates((p) => ({ ...p, [file.id]: "downloading" }));
    setTimeout(() => {
      setDownloadStates((p) => ({ ...p, [file.id]: "done" }));
      setTimeout(
        () => setDownloadStates((p) => ({ ...p, [file.id]: "idle" })),
        2500,
      );
    }, 2000);
  };

  const stage = PIPELINE_STAGES[stageIdx];
  const StageIcon = stage.icon;

  const totalSize = MOCK_FILES.reduce((s, f) => s + f.original_size, 0);
  const totalEncrypted = MOCK_FILES.reduce((s, f) => s + f.encrypted_size, 0);

  return (
    <div className="flex h-dvh overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────── */}
      <aside className="hidden md:flex w-[220px] flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)] shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5">
          <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/20">
            <Shield className="h-[18px] w-[18px] text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <span className="text-[15px] font-bold tracking-tight">zpush</span>
            <p className="text-[10px] text-[var(--color-text-muted)] -mt-0.5">
              encrypted vault
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 space-y-1">
          {NAV.map(({ icon: Icon, label, active }) => (
            <div
              key={label}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-all duration-150 cursor-default",
                active
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-300 shadow-sm shadow-emerald-500/5"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-1)]",
              )}
            >
              <Icon
                className={cn(
                  "h-[18px] w-[18px]",
                  active ? "text-emerald-600 dark:text-emerald-400" : "",
                )}
              />
              {label}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="px-4 py-4 border-t border-[var(--color-border)] flex items-center justify-between">
          <p className="text-[10px] text-[var(--color-text-muted)] leading-relaxed">
            zpush v0.2
          </p>
          <button
            onClick={toggleTheme}
            className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-[var(--color-surface-1)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
            aria-label="Toggle theme"
          >
            {isDark ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
      </aside>

      {/* ── Main ────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-8 space-y-6">
          {/* Demo mode banner */}
          <div className="flex items-center gap-2.5 rounded-2xl border border-sky-500/20 bg-sky-500/5 px-4 py-3">
            <Info className="h-4 w-4 text-sky-500 shrink-0" />
            <p className="text-xs text-sky-600 dark:text-sky-300 font-medium">
              Demo mode — all data is simulated. Downloads and uploads are
              disabled.
            </p>
          </div>

          {/* Header */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Vault
            </h1>
            <div className="mt-1.5">
              <CompactStats
                fileCount={MOCK_FILES.length}
                totalSize={totalSize}
                totalEncrypted={totalEncrypted}
              />
            </div>
          </div>

          {/* Upload zone */}
          <UploadZone
            onFiles={() => {}}
            hint="Demo mode — connect a platform in Settings to enable real uploads"
          />

          {/* Animated pipeline card */}
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                Upload Pipeline — Live Demo
              </h3>
              <span className="text-[10px] text-[var(--color-text-muted)]">
                {stage.pct}%
              </span>
            </div>

            {/* Pipeline file row */}
            <div className="flex items-center gap-3">
              <div className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-xl bg-emerald-500/10">
                <StageIcon
                  className={cn(
                    "h-4 w-4 transition-colors duration-500",
                    stage.color,
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {DEMO_UPLOADING_FILE.name}
                </p>
                <p
                  className={cn(
                    "text-[11px] font-medium transition-colors duration-300 animate-pulse-soft",
                    stage.color,
                  )}
                >
                  {stage.label}
                </p>
                {/* Progress bar */}
                <div className="mt-2 h-1.5 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${stage.pct}%`,
                      background:
                        stage.pct === 100
                          ? "linear-gradient(90deg, #10b981, #34d399)"
                          : stage.pct >= 64
                            ? "linear-gradient(90deg, #38bdf8, #60a5fa)"
                            : stage.pct >= 40
                              ? "linear-gradient(90deg, #a78bfa, #818cf8)"
                              : "linear-gradient(90deg, #fbbf24, #f59e0b)",
                    }}
                  />
                </div>
              </div>
              <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums shrink-0">
                {DEMO_UPLOADING_FILE.size}
              </span>
            </div>

            {/* Stage chips */}
            <div className="flex items-center gap-2 flex-wrap">
              {(["Compress", "Encrypt", "Upload"] as const).map((s, i) => {
                const active =
                  (i === 0 && stage.pct < 40) ||
                  (i === 1 && stage.pct >= 40 && stage.pct < 64) ||
                  (i === 2 && stage.pct >= 64);
                const done =
                  (i === 0 && stage.pct >= 40) ||
                  (i === 1 && stage.pct >= 64) ||
                  (i === 2 && stage.pct === 100);
                return (
                  <span
                    key={s}
                    className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full border transition-all duration-500 font-medium",
                      done
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
                        : active
                          ? "bg-[var(--color-surface-1)] border-[var(--color-border-hover)] text-[var(--color-text)]"
                          : "border-[var(--color-border)] text-[var(--color-text-muted)]",
                    )}
                  >
                    {done ? "✓ " : active ? "⟳ " : ""}
                    {s}
                  </span>
                );
              })}
            </div>
          </div>

          {/* File list */}
          <div>
            <h2 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
              Your Files
            </h2>
            <div className="space-y-2">
              {MOCK_FILES.map((file) => (
                <FileCard
                  key={file.id}
                  file={file}
                  downloadState={downloadStates[file.id] ?? "idle"}
                  onDownload={handleDemoDownload}
                  onDelete={() => {}}
                />
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
