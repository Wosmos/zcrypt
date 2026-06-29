"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useFileList } from "@/hooks/useFileList";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useQuota } from "@/hooks/useQuota";
import { formatBytes, cn } from "@/lib/utils";
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
import { StorageHealth } from "@/components/analytics/storage-health";
import { StorageGrowth } from "@/components/analytics/storage-growth";
import { VaultDetails } from "@/components/analytics/vault-details";
import { AdvancedDetails } from "@/components/analytics/advanced-details";
import { Layers, HardDrive, TrendingDown, Server, RefreshCw, BarChart3, FileText, Gauge } from "@/lib/icons";
import AnalyticsLoading from "@/app/(app)/analytics/loading";

export function AnalyticsClient() {
  const { files, loading, error, refresh } = useFileList();
  const { repos, statuses, refresh: refreshPlatforms } = usePlatformHealth();
  const { quota: quotaInfo, refresh: refreshQuota } = useQuota();
  const [refreshing, setRefreshing] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const reduceMotion = useReducedMotion();

  const totalOriginal = files.reduce((s, f) => s + f.original_size, 0);
  const totalEncrypted = files.reduce((s, f) => s + f.encrypted_size, 0);
  const totalChunks = files.reduce((s, f) => s + f.chunk_count, 0);
  const savings = totalOriginal > 0 ? ((1 - totalEncrypted / totalOriginal) * 100).toFixed(1) : "0";
  const spaceSaved = totalOriginal - totalEncrypted;
  const largestFile = files.reduce((m, f) => Math.max(m, f.original_size), 0);
  const platformCount = new Set(statuses.filter((s) => s.connected).map((s) => s.platform)).size;
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
      eyebrow="Dashboard"
      title="Insights"
      description="Storage, compression, platforms and upload activity across your encrypted library."
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAdvanced((v) => !v)}
            aria-pressed={advanced}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
              advanced
                ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
                : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]"
            )}
          >
            <Gauge className="h-4 w-4" />
            Advanced
          </button>
          <IconButton
            icon={RefreshCw}
            label={refreshing ? "Refreshing…" : "Refresh data"}
            variant="secondary"
            onClick={handleRefresh}
            disabled={refreshing}
            iconClassName={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          />
        </div>
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
            title="Couldn't load insights"
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
            title="No insights yet"
            description="Upload your first file to start seeing storage, compression and upload insights here."
          />
        </div>
      </div>
    );
  }

  const container = reduceMotion
    ? undefined
    : { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
  const item = reduceMotion
    ? undefined
    : {
        hidden: { opacity: 0, y: 12 },
        show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
      };

  return (
    <motion.div
      className="space-y-6"
      variants={container}
      initial={reduceMotion ? undefined : "hidden"}
      animate={reduceMotion ? undefined : "show"}
    >
      {header}

      {/* Headline metrics */}
      <motion.div variants={item} className="grid grid-cols-2 gap-4 lg:grid-cols-5">
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
          label="Largest file"
          value={formatBytes(largestFile)}
          hint="single upload"
          icon={FileText}
        />
        <StatCard
          label="Platforms"
          value={platformCount.toLocaleString()}
          hint={`${activeRepos} active repo${activeRepos !== 1 ? "s" : ""}`}
          icon={Server}
        />
      </motion.div>

      {/* Storage hero */}
      <motion.div variants={item}>
        <StorageHero files={files} quotaInfo={quotaInfo} />
      </motion.div>

      {/* Storage by file type */}
      <motion.div variants={item}>
        <StatCards files={files} />
      </motion.div>

      {/* Activity + distribution */}
      <motion.div variants={item} className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <UploadChart files={files} />
        </div>
        <FileTypeChart files={files} />
      </motion.div>

      {/* Storage growth over time */}
      <motion.div variants={item}>
        <StorageGrowth files={files} />
      </motion.div>

      {/* Detailed metrics */}
      <motion.div variants={item}>
        <VaultDetails files={files} />
      </motion.div>

      {/* Platforms + storage health */}
      <motion.div variants={item} className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PlatformBreakdown statuses={statuses} repos={repos} />
        <StorageHealth repos={repos} />
      </motion.div>

      {/* Recent uploads */}
      <motion.div variants={item}>
        <RecentUploads files={files} />
      </motion.div>

      {/* Advanced (toggle) */}
      {advanced && (
        <motion.div
          variants={item}
          initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <AdvancedDetails files={files} repos={repos} quotaInfo={quotaInfo} />
        </motion.div>
      )}
    </motion.div>
  );
}
