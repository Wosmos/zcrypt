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
import { TrendingUp, HardDrive, Layers, TrendingDown, BarChart3 } from "@/lib/icons";
import AnalyticsLoading from "./loading";

export default function AnalyticsPage() {
  const { files, loading } = useFileList();
  const { repos } = usePlatformHealth();

  const totalOriginal = files.reduce((s, f) => s + f.original_size, 0);
  const totalEncrypted = files.reduce((s, f) => s + f.encrypted_size, 0);
  const totalChunks = files.reduce((s, f) => s + f.chunk_count, 0);
  const savings = totalOriginal > 0 ? ((1 - totalEncrypted / totalOriginal) * 100).toFixed(1) : "0";
  const spaceSaved = totalOriginal - totalEncrypted;

  if (loading) {
    return <AnalyticsLoading />;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-blue-500/10 ring-1 ring-blue-500/20">
          <BarChart3 className="h-5 w-5 text-blue-500" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">Insights</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Analytics</h1>
        </div>
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
          icon={<TrendingDown className="h-4 w-4 text-cyan-500" />}
          label="Space Saved"
          value={formatBytes(spaceSaved)}
          sub={`${savings}% compression`}
          bg="bg-cyan-500/10"
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
    <div className="card p-4 relative overflow-hidden">
      <div className="flex items-center gap-3 mb-3">
        <div className={`flex items-center justify-center h-9 w-9 rounded-xl ${bg}`}>
          {icon}
        </div>
        <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-semibold">{label}</p>
      </div>
      <p className="text-xl font-bold">{value}</p>
      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{sub}</p>
    </div>
  );
}
