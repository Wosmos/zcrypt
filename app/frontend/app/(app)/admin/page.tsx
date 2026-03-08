"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { SystemStatsCards } from "@/components/admin/system-stats";
import { UserTable } from "@/components/admin/user-table";
import { TokenManagement } from "@/components/admin/token-management";
import { QuotaSettings } from "@/components/admin/quota-settings";
import { adminGetStats, adminListUsers, adminListTokens, adminGetDefaultQuota } from "@/lib/api";
import { Role } from "@/types";
import type { AdminUser, SystemStats, PlatformTokenInfo } from "@/types";

export default function AdminPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [tokens, setTokens] = useState<PlatformTokenInfo[]>([]);
  const [defaultQuotaBytes, setDefaultQuotaBytes] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user && user.role !== Role.Admin) {
      router.push("/dashboard");
    }
  }, [user, router]);

  const refresh = async () => {
    try {
      const [s, u, t, q] = await Promise.all([
        adminGetStats(),
        adminListUsers(),
        adminListTokens(),
        adminGetDefaultQuota(),
      ]);
      setStats(s);
      setUsers(u);
      setTokens(t);
      setDefaultQuotaBytes(q.default_quota_bytes);
    } catch {
      // User may not be admin — redirect handled above
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === Role.Admin) {
      refresh();
    }
  }, [user]);

  if (!user || user.role !== Role.Admin) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="h-6 w-6 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Admin Dashboard
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          System overview and user management
        </p>
      </div>

      {stats && <SystemStatsCards stats={stats} />}

      <QuotaSettings defaultQuotaBytes={defaultQuotaBytes} onRefresh={refresh} />

      <UserTable users={users} currentUserId={user.id} defaultQuotaBytes={defaultQuotaBytes} onRefresh={refresh} />

      <TokenManagement tokens={tokens} onRefresh={refresh} />
    </div>
  );
}
