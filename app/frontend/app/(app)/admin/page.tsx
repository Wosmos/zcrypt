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

export default function AdminOverviewPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [tokens, setTokens] = useState<PlatformTokenInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const [s, t] = await Promise.all([
        adminGetStats(),
        adminListTokens(),
      ]);
      setStats(s);
      setTokens(t);
    } catch {
      // handled by layout redirect
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

  return (
    <div className="space-y-8">
      {stats && <SystemStatsCards stats={stats} />}
      <TokenManagement tokens={tokens} onRefresh={refresh} currentUserId={user.id} />
      <FeedbackList />
    </div>
  );
}
