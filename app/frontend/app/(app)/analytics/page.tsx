"use client";

import { useFileList } from "@/hooks/useFileList";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { formatBytes } from "@/lib/utils";
import { StorageHero } from "@/components/analytics/storage-hero";
import { StatCards } from "@/components/analytics/stat-cards";
import { UploadChart } from "@/components/analytics/upload-chart";
import { FileTypeChart } from "@/components/analytics/file-type-chart";
import { RecentUploads } from "@/components/analytics/recent-uploads";
import { PlatformBreakdown } from "@/components/analytics/platform-breakdown";
import { TrendingUp, HardDrive, Layers, TrendingDown } from "lucide-react";

export default function AnalyticsPage() {
  const { files, loading } = useFileList();
  const { repos } = usePlatformHealth();

  const totalOriginal = files.reduce((s, f) => s + f.original_size, 0);
  const totalEncrypted = files.reduce((s, f) => s + f.encrypted_size, 0);
  const totalChunks = files.reduce((s, f) => s + f.chunk_count, 0);
  const savings = totalOriginal > 0 ? ((1 - totalEncrypted / totalOriginal) * 100).toFixed(1) : "0";
  const spaceSaved = totalOriginal - totalEncrypted;

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Storage insights and upload activity</p>
        </div>
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 border-2 border-[var(--color-border)] border-t-emerald-500 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Storage insights and upload activity</p>
      </div>

      {/* Quick stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <QuickStat
          icon={<Layers className="h-4 w-4 text-blue-500" />}
          label="Total Files"
          value={String(files.length)}
          sub={`${totalChunks} chunks`}
          bg="bg-blue-500/10"
        />
        <QuickStat
          icon={<HardDrive className="h-4 w-4 text-violet-500" />}
          label="Original Size"
          value={formatBytes(totalOriginal)}
          sub={`Encrypted: ${formatBytes(totalEncrypted)}`}
          bg="bg-violet-500/10"
        />
        <QuickStat
          icon={<TrendingDown className="h-4 w-4 text-emerald-500" />}
          label="Space Saved"
          value={formatBytes(spaceSaved)}
          sub={`${savings}% compression`}
          bg="bg-emerald-500/10"
        />
        <QuickStat
          icon={<TrendingUp className="h-4 w-4 text-amber-500" />}
          label="Platforms"
          value={String(repos.length)}
          sub={`${repos.filter((r) => r.active).length} active repos`}
          bg="bg-amber-500/10"
        />
      </div>

      {/* Storage hero */}
      <StorageHero files={files} repos={repos} />

      {/* File type stat cards */}
      <StatCards files={files} />

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <UploadChart files={files} />
        </div>
        <FileTypeChart files={files} />
      </div>

      {/* Platform breakdown + Recent uploads */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <PlatformBreakdown repos={repos} />
        <div className="lg:col-span-2">
          <RecentUploads files={files} />
        </div>
      </div>
    </div>
  );
}

function QuickStat({ icon, label, value, sub, bg }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  bg: string;
}) {
  return (
    <div className="card p-4">
      <div className={`flex items-center justify-center h-8 w-8 rounded-lg ${bg} mb-2`}>
        {icon}
      </div>
      <p className="text-[11px] text-[var(--color-text-muted)] uppercase tracking-wider font-medium">{label}</p>
      <p className="text-lg font-bold mt-0.5">{value}</p>
      <p className="text-[11px] text-[var(--color-text-secondary)]">{sub}</p>
    </div>
  );
}
