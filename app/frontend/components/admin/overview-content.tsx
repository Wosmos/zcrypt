"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { SystemStatsCards } from "@/components/admin/system-stats";
import { TokenManagement } from "@/components/admin/token-management";
import { FeedbackList } from "@/components/admin/feedback-list";
import { adminGetStats, adminListTokens } from "@/lib/api";
import { Role } from "@/types";
import type { SystemStats, PlatformTokenInfo } from "@/types";
import { OverviewSkeleton } from "@/components/admin/skeletons";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "@/lib/icons";

export function AdminOverviewContent() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [tokens, setTokens] = useState<PlatformTokenInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = async () => {
    setError(false);
    try {
      const [s, t] = await Promise.all([adminGetStats(), adminListTokens()]);
      setStats(s);
      setTokens(t);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === Role.Admin) {
      refresh();
    }
  }, [user]);

  if (!user || user.role !== Role.Admin) return null;

  if (loading) return <OverviewSkeleton />;

  if (error && !stats) {
    return (
      <div className="panel p-6">
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title="Couldn't load overview"
          description="We couldn't reach the server to load system stats and tokens. Check your connection and try again."
          action={
            <Button variant="secondary" size="sm" onClick={refresh}>
              Try again
            </Button>
          }
        />
      </div>
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
