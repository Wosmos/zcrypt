"use client";

import { useTranslations } from "next-intl";
import { useState, useRef, useEffect } from "react";
import { Users, FileText, Database, GitBranch, AlertTriangle, ChevronDown } from "@/lib/icons";
import { formatBytes } from "@/lib/utils";
import { StatCard } from "@/components/ui/stat-card";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { toast } from "@/store/toast";
import { adminRunReconcile, adminGetHealthDetails } from "@/lib/api";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { qk } from "@/lib/query-keys";
import type { SystemStats, AdminHealthDetails } from "@/types";

function DurabilityAlertDetails({
  data,
  loading,
  onClose,
  onRefresh,
}: {
  data: AdminHealthDetails | null;
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const t = useTranslations("admin.stats");
  const [reconciling, setReconciling] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const result = await adminRunReconcile();
      toast.success(
        t("reconcileDone", { missing: result.total_missing, orphans: result.total_orphans }),
      );
      onRefresh();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("reconcileFailed"));
    } finally {
      setReconciling(false);
    }
  };

  useEffect(() => {
    if (contentRef.current && !loading) {
      contentRef.current.focus();
    }
  }, [loading]);

  return (
    <div
      ref={contentRef}
      tabIndex={-1}
      className="space-y-4"
      role="region"
      aria-label={t("healthDetails")}
      aria-live="polite"
    >
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : data ? (
        <>
          {data.totals && (
            <div className="text-xs text-[var(--color-text-muted)]">
              <div className="font-medium text-[var(--color-text)]">{t("systemTotals")}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {data.totals.damaged_files > 0 && (
                  <Badge variant="amber">
                    {t("damagedFiles", { count: data.totals.damaged_files })}
                  </Badge>
                )}
                {data.totals.degraded_files > 0 && (
                  <Badge variant="amber">
                    {t("degradedFiles", { count: data.totals.degraded_files })}
                  </Badge>
                )}
                {data.totals.stuck_chunks > 0 && (
                  <Badge variant="amber">
                    {t("stuckChunks", { count: data.totals.stuck_chunks })}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {data.users && data.users.length > 0 && (
            <div className="text-xs text-[var(--color-text-muted)]">
              <div className="font-medium text-[var(--color-text)]">{t("affectedUsers")}</div>
              <div className="mt-2 max-h-40 overflow-y-auto space-y-2 rounded-lg bg-[var(--color-surface-1)] p-3">
                {data.users.map((user) => (
                  <div
                    key={user.user_id}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[var(--color-text)]">{user.username}</div>
                      <div className="truncate text-[var(--color-text-muted)]">{user.email}</div>
                    </div>
                    <div className="flex flex-shrink-0 gap-1">
                      {user.damaged_files > 0 && (
                        <Badge variant="amber" className="py-0.5 px-1.5 text-xs">
                          {user.damaged_files}D
                        </Badge>
                      )}
                      {user.degraded_files > 0 && (
                        <Badge variant="amber" className="py-0.5 px-1.5 text-xs">
                          {user.degraded_files}G
                        </Badge>
                      )}
                      {user.stuck_chunks > 0 && (
                        <Badge variant="amber" className="py-0.5 px-1.5 text-xs">
                          {user.stuck_chunks}S
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {data.sample_files && data.sample_files.length > 0 && (
            <div className="text-xs text-[var(--color-text-muted)]">
              <div className="font-medium text-[var(--color-text)]">{t("sampleFiles")}</div>
              <div className="mt-2 max-h-32 overflow-y-auto space-y-2 rounded-lg bg-[var(--color-surface-1)] p-3">
                {data.sample_files.map((file) => (
                  <div key={file.id} className="flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-[var(--color-text)]">
                        {file.id.slice(0, 8)}
                      </div>
                      <div className="truncate text-[var(--color-text-muted)]">{file.reason}</div>
                    </div>
                    <Badge
                      variant={file.status === "damaged" ? "amber" : "muted"}
                      className="flex-shrink-0 py-0.5 px-1.5"
                    >
                      {file.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Button
            onClick={handleReconcile}
            disabled={reconciling}
            variant="primary"
            size="md"
            className="w-full"
          >
            {reconciling && <LogoSpinner size="sm" speed="fast" />}
            {reconciling ? t("runningReconcile") : t("runReconcile")}
          </Button>
        </>
      ) : null}
    </div>
  );
}

function DurabilityAlert({ stats }: { stats: SystemStats }) {
  const t = useTranslations("admin.stats");
  const degraded = stats.degraded_files ?? 0;
  const damaged = stats.damaged_files ?? 0;
  const stuck = stats.stuck_chunks ?? 0;
  const total = degraded + damaged + stuck;

  const [open, setOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const { data, loading, refresh } = useAdminQuery(qk.adminHealthDetails, async () => {
    try {
      return await adminGetHealthDetails();
    } catch {
      return null;
    }
  });

  if (total === 0) return null;

  const summary = [
    damaged > 0 && t("damagedFiles", { count: damaged }),
    degraded > 0 && t("degradedFiles", { count: degraded }),
    stuck > 0 && t("stuckChunks", { count: stuck }),
  ]
    .filter(Boolean)
    .join(", ");

  const Content = (
    <DurabilityAlertDetails
      data={data ?? null}
      loading={loading}
      onClose={() => setOpen(false)}
      onRefresh={refresh}
    />
  );

  if (isMobile) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-[var(--color-text)] hover:bg-amber-500/15 transition-colors"
          role="alert"
        >
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
            <span className="font-medium truncate">{summary}</span>
          </div>
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-amber-500" />
        </button>
        <BottomSheet open={open} onClose={() => setOpen(false)} title={t("healthDetails")}>
          <div className="space-y-4 p-4">{Content}</div>
        </BottomSheet>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-left text-sm text-[var(--color-text)] hover:bg-amber-500/15 transition-colors"
          role="alert"
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
            <span className="font-medium">{summary}</span>
          </div>
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium">
            {t("details")}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start">
        {Content}
      </PopoverContent>
    </Popover>
  );
}

export function SystemStatsCards({ stats }: { stats: SystemStats }) {
  const t = useTranslations("admin.stats");
  return (
    <div className="space-y-4">
      <DurabilityAlert stats={stats} />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={t("totalUsers")}
          value={stats.total_users.toLocaleString()}
          icon={Users}
          accent
        />
        <StatCard
          label={t("totalFiles")}
          value={stats.total_files.toLocaleString()}
          icon={FileText}
        />
        <StatCard label={t("totalStorage")} value={formatBytes(stats.total_size)} icon={Database} />
        <StatCard
          label={t("totalRepos")}
          value={stats.total_repos.toLocaleString()}
          icon={GitBranch}
        />
      </div>
    </div>
  );
}
