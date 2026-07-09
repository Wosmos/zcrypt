"use client";

import { useCallback, useState } from "react";
import { SystemStatsCards } from "@/components/admin/system-stats";
import { TokenManagement } from "@/components/admin/token-management";
import { FeedbackList } from "@/components/admin/feedback-list";
import { adminGetStats, adminListTokens } from "@/lib/api";
import { Role } from "@/types";
import type { SystemStats, PlatformTokenInfo } from "@/types";
import { OverviewSkeleton } from "@/components/admin/skeletons";
import { LoadErrorPanel } from "@/components/admin/load-error-panel";
import { useAdminGuardedFetch } from "@/hooks/useAdminGuardedFetch";
import { AlertTriangle } from "@/lib/icons";

export function AdminOverviewContent() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [tokens, setTokens] = useState<PlatformTokenInfo[]>([]);

  const fetcher = useCallback(async () => {
    const [s, t] = await Promise.all([adminGetStats(), adminListTokens()]);
    setStats(s);
    setTokens(t);
  }, []);
  const { user, loading, error, refresh } = useAdminGuardedFetch(fetcher);

  if (!user || user.role !== Role.Admin) return null;

  if (loading) return <OverviewSkeleton />;

  if (error && !stats) {
    return (
      <LoadErrorPanel
        icon={<AlertTriangle className="h-7 w-7 text-[var(--color-text-muted)]" />}
        title="Couldn't load overview"
        description="We couldn't reach the server to load system stats and tokens. Check your connection and try again."
        onRetry={refresh}
      />
    );
  }

  return (
    <div className="space-y-8">
      {stats && <SystemStatsCards stats={stats} />}
      <TokenManagement tokens={tokens} onRefresh={refresh} currentUserId={user.id} />
      <FeedbackList />
    </div>
  );
}
