"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useFileList } from "@/hooks/useFileList";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useQuota } from "@/hooks/useQuota";
import { formatBytes } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { StorageHero } from "@/components/analytics/storage-hero";
import { StatCards } from "@/components/analytics/stat-cards";
import { UploadChart } from "@/components/analytics/upload-chart";
import { FileTypeChart } from "@/components/analytics/file-type-chart";
import { RecentUploads } from "@/components/analytics/recent-uploads";
import { PlatformBreakdown } from "@/components/analytics/platform-breakdown";
import { Layers, HardDrive, TrendingDown, Server, RefreshCw, BarChart3 } from "@/lib/icons";
import AnalyticsLoading from "@/app/(app)/analytics/loading";

export function AnalyticsClient() {
  const { files, loading, error, refresh } = useFileList();
  const { repos, refresh: refreshPlatforms } = usePlatformHealth();
  const { quota: quotaInfo, refresh: refreshQuota } = useQuota();
  const [refreshing, setRefreshing] = useState(false);
  const reduceMotion = useReducedMotion();

  const totalOriginal = files.reduce((s, f) => s + f.original_size, 0);
  const totalEncrypted = files.reduce((s, f) => s + f.encrypted_size, 0);
  const totalChunks = files.reduce((s, f) => s + f.chunk_count, 0);
  const savings = totalOriginal > 0 ? ((1 - totalEncrypted / totalOriginal) * 100).toFixed(1) : "0";
  const spaceSaved = totalOriginal - totalEncrypted;
  const platformCount = new Set(repos.map((r) => r.platform)).size;
  const activeRepos = repos.filter((r) => r.active).length;

  async function handleRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([refresh(), refreshPlatforms(), refreshQuota()]);
    } finally {
      setRefreshing(false);
    }
  }

  if (loading && files.length === 0) {
    return <AnalyticsLoading />;
  }

  const header = (
    <PageHeader
      eyebrow="Insights"
      title="Analytics"
      description="Storage, compression and upload activity across your encrypted library."
      actions={
        <IconButton
          icon={RefreshCw}
          label={refreshing ? "Refreshing…" : "Refresh data"}
          variant="secondary"
          onClick={handleRefresh}
          disabled={refreshing}
          iconClassName={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
        />
      }
    />
  );

  if (error && files.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="panel p-6">
          <EmptyState
            icon={<BarChart3 className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title="Couldn't load analytics"
            description="We couldn't reach your library to build these insights. Check your connection and try again."
          />
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="space-y-6">
        {header}
        <div className="panel p-6">
          <EmptyState
            icon={<BarChart3 className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title="No analytics yet"
            description="Upload your first file to start seeing storage, compression and upload insights here."
          />
        </div>
      </div>
    );
  }

  const fade = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.25, ease: "easeOut" as const },
      };

  return (
    <motion.div className="space-y-6" {...fade}>
      {header}

      {/* Headline metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total files"
          value={files.length.toLocaleString()}
          hint={`${totalChunks.toLocaleString()} chunks`}
          icon={Layers}
        />
        <StatCard
          label="Storage"
          value={formatBytes(totalOriginal)}
          hint={`Encrypted: ${formatBytes(totalEncrypted)}`}
          icon={HardDrive}
        />
        <StatCard
          label="Space saved"
          value={formatBytes(Math.max(0, spaceSaved))}
          hint={`${savings}% compression`}
          icon={TrendingDown}
          accent
        />
        <StatCard
          label="Platforms"
          value={platformCount.toLocaleString()}
          hint={`${activeRepos} active repo${activeRepos !== 1 ? "s" : ""}`}
          icon={Server}
        />
      </div>

      {/* Storage hero */}
      <StorageHero files={files} quotaInfo={quotaInfo} />

      {/* Storage by file type */}
      <StatCards files={files} />

      {/* Activity + distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UploadChart files={files} />
        </div>
        <FileTypeChart files={files} />
      </div>

      {/* Platforms + recent */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <PlatformBreakdown repos={repos} />
        <div className="lg:col-span-2">
          <RecentUploads files={files} />
        </div>
      </div>
    </motion.div>
  );
}
