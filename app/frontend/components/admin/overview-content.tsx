"use client";

import { useTranslations } from "next-intl";
import { SystemStatsCards } from "@/components/admin/system-stats";
import { TokenManagement } from "@/components/admin/token-management";
import { AdminSendStorage } from "@/components/admin/send-storage";
import { FeedbackList } from "@/components/admin/feedback-list";
import { Role } from "@/types";
import { OverviewSkeleton } from "@/components/admin/skeletons";
import { LoadErrorPanel } from "@/components/admin/load-error-panel";
import { useAdminQuery, fetchAdminOverview } from "@/hooks/useAdminGuardedFetch";
import { qk } from "@/lib/query-keys";
import { AlertTriangle } from "@/lib/icons";

export function AdminOverviewContent() {
  const t = useTranslations("admin.overview");
  const { user, data, loading, error, refresh } = useAdminQuery(
    qk.adminOverview,
    fetchAdminOverview,
  );
  const stats = data?.stats ?? null;
  const tokens = data?.tokens ?? [];

  if (!user || user.role !== Role.Admin) return null;

  if (loading) return <OverviewSkeleton />;

  if (error && !stats) {
    return (
      <LoadErrorPanel
        icon={<AlertTriangle className="h-7 w-7 text-[var(--color-text-muted)]" />}
        title={t("errorTitle")}
        description={t("errorDesc")}
        onRetry={refresh}
      />
    );
  }

  return (
    <div className="space-y-8">
      {stats && <SystemStatsCards stats={stats} />}
      <TokenManagement tokens={tokens} othersCount={data?.othersCount ?? 0} onRefresh={refresh} />
      <AdminSendStorage />
      <FeedbackList />
    </div>
  );
}
