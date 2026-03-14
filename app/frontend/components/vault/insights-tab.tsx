"use client";

import { formatBytes } from "@/lib/utils";
import { StorageHero } from "@/components/analytics/storage-hero";
import { StatCards } from "@/components/analytics/stat-cards";
import { UploadChart } from "@/components/analytics/upload-chart";
import { FileTypeChart } from "@/components/analytics/file-type-chart";
import { UserQuota } from "@/components/vault/user-quota";
import { TrendingUp, HardDrive, Layers, TrendingDown } from "@/lib/icons";
import type { FileMetadata, RepoInfo, QuotaInfo } from "@/types";

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

export function InsightsTab({ files, repos, quotaInfo }: { files: FileMetadata[]; repos: RepoInfo[]; quotaInfo?: QuotaInfo | null }) {
  const totalOriginal = files.reduce((s, f) => s + f.original_size, 0);
  const totalEncrypted = files.reduce((s, f) => s + f.encrypted_size, 0);
  const totalChunks = files.reduce((s, f) => s + f.chunk_count, 0);
  const savings = totalOriginal > 0 ? ((1 - totalEncrypted / totalOriginal) * 100).toFixed(1) : "0";
  const spaceSaved = totalOriginal - totalEncrypted;

  const storageSub = quotaInfo && !quotaInfo.is_unlimited && quotaInfo.quota_bytes > 0
    ? `${formatBytes(quotaInfo.used_bytes)} / ${formatBytes(quotaInfo.quota_bytes)} used`
    : `Encrypted: ${formatBytes(totalEncrypted)}`;

  return (
    <div className="space-y-6 animate-fade-in">
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
          label="Storage"
          value={formatBytes(totalOriginal)}
          sub={storageSub}
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

      {/* User quota card */}
      {quotaInfo && <UserQuota quota={quotaInfo} />}

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
    </div>
  );
}
