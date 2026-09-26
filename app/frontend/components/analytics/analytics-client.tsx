"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useQuota } from "@/hooks/useQuota";
import {
  useAnalyticsSummary,
  useAnalyticsTimeseries,
  useStorageGrowth,
  useAnalyticsFileTypes,
  useRecentUploads,
  useAppDownloadsTotal,
  useRefreshAnalytics,
} from "@/hooks/useAnalytics";
import { useRefreshCooldown } from "@/hooks/useRefreshCooldown";
import { useAnalyticsFiltersStore } from "@/store/analytics-filters";
import { getRangeBounds } from "@/components/analytics/date-range";
import { ApiError } from "@/lib/http-error";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { Section } from "@/components/ui/section";
import { DateRangeControl } from "@/components/analytics/date-range-control";
import { KpiHeroRow } from "@/components/analytics/kpi-hero-row";
import { KpiSecondaryStrip } from "@/components/analytics/kpi-secondary-strip";
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
import { RefreshCw, BarChart3, Gauge } from "@/lib/icons";
import AnalyticsLoading from "@/app/(app)/analytics/loading";

export function AnalyticsClient() {
  const { preset, customStart, customEnd } = useAnalyticsFiltersStore();
  const range = useMemo(
    () => getRangeBounds(preset, customStart, customEnd),
    [preset, customStart, customEnd],
  );
  const allTimeRange = useMemo(() => getRangeBounds("all", null, null), []);

  const { summary, isLoading: summaryLoading, error: summaryError } = useAnalyticsSummary(range);
  const { summary: allTimeSummary, isLoading: allTimeSummaryLoading } =
    useAnalyticsSummary(allTimeRange);
  const { data: timeseries, isLoading: timeseriesLoading } = useAnalyticsTimeseries(range);
  const { points: growthPoints, isLoading: growthLoading } = useStorageGrowth();
  const { items: rangeItems } = useAnalyticsFileTypes(range);
  const { items: allTimeItems } = useAnalyticsFileTypes(allTimeRange);
  const { files: recentFiles } = useRecentUploads(8);
  const appDownloads = useAppDownloadsTotal();

  const { repos, statuses, refresh: refreshPlatforms } = usePlatformHealth();
  const { quota: quotaInfo, refresh: refreshQuota } = useQuota();

  const [advanced, setAdvanced] = useState(false);
  const reduceMotion = useReducedMotion();

  const refreshAnalytics = useRefreshAnalytics();
  const {
    canRefresh,
    busy: refreshing,
    remainingMs,
    trigger: handleRefresh,
  } = useRefreshCooldown(async () => {
    await Promise.all([refreshAnalytics(), refreshPlatforms(), refreshQuota()]);
  });

  const platformCount = new Set(statuses.filter((s) => s.connected).map((s) => s.platform)).size;
  const activeRepos = repos.filter((r) => r.active).length;

  const initialLoading = (summaryLoading || allTimeSummaryLoading) && !summary && !allTimeSummary;

  if (initialLoading) {
    return <AnalyticsLoading />;
  }

  const refreshLabel = refreshing
    ? "Refreshing…"
    : !canRefresh
      ? `Refresh available in ${Math.ceil(remainingMs / 60_000)}m`
      : "Refresh data";

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
                : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]",
            )}
          >
            <Gauge className="h-4 w-4" />
            Advanced
          </button>
          <IconButton
            icon={RefreshCw}
            label={refreshLabel}
            variant="secondary"
            onClick={handleRefresh}
            disabled={refreshing || !canRefresh}
            iconClassName={refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"}
          />
        </div>
      }
    />
  );

  if (summaryError && !summary) {
    const rateLimited = summaryError instanceof ApiError && summaryError.status === 429;
    return (
      <div className="space-y-6">
        {header}
        <div className="panel p-6">
          <EmptyState
            icon={<BarChart3 className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title={rateLimited ? "Slow down a little" : "Couldn't load insights"}
            description={
              rateLimited
                ? "You've refreshed this a lot in a short time. Wait a few minutes and it'll load again."
                : "We couldn't reach your library to build these insights. Check your connection and try again."
            }
          />
        </div>
      </div>
    );
  }

  if (allTimeSummary && allTimeSummary.file_count === 0) {
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

      <motion.div variants={item}>
        <DateRangeControl />
      </motion.div>

      <motion.div variants={item}>
        <Section title="This period" description={range.label}>
          <KpiHeroRow summary={summary} showTrend={!range.allTime} />
          <KpiSecondaryStrip
            largestFileSize={summary?.largest_file?.original_size ?? null}
            platformCount={platformCount}
            activeRepos={activeRepos}
            appDownloads={appDownloads}
          />
          <UploadChart
            points={timeseries?.points ?? []}
            bucket={range.bucket}
            isLoading={timeseriesLoading}
          />
          <StatCards items={rangeItems} />
        </Section>
      </motion.div>

      <motion.div variants={item}>
        <Section title="Your vault" description="Lifetime — not affected by the selected range">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <StorageHero
                totalOriginal={allTimeSummary?.original_bytes ?? 0}
                quotaInfo={quotaInfo}
                items={allTimeItems}
              />
            </div>
            <FileTypeChart items={allTimeItems} />
          </div>
          <StorageGrowth points={growthPoints} isLoading={growthLoading} />
        </Section>
      </motion.div>

      <motion.div variants={item}>
        <Section title="Details">
          <VaultDetails summary={summary} items={rangeItems} />
          <RecentUploads files={recentFiles} />
        </Section>
      </motion.div>

      <motion.div variants={item}>
        <Section title="Platforms">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <PlatformBreakdown statuses={statuses} repos={repos} />
            <StorageHealth repos={repos} />
          </div>
        </Section>
      </motion.div>

      {advanced && (
        <motion.div
          variants={item}
          initial={reduceMotion ? undefined : { opacity: 0, y: 12 }}
          animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          <AdvancedDetails summary={summary} repos={repos} quotaInfo={quotaInfo} />
        </motion.div>
      )}
    </motion.div>
  );
}
