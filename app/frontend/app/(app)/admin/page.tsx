"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { SystemStatsCards } from "@/components/admin/system-stats";
import { UserTable } from "@/components/admin/user-table";
import { TokenManagement } from "@/components/admin/token-management";
import { QuotaSettings } from "@/components/admin/quota-settings";
import { AuditLog } from "@/components/admin/audit-log";
import { FeedbackList } from "@/components/admin/feedback-list";
import { adminGetStats, adminListUsers, adminListTokens, adminGetDefaultQuota } from "@/lib/api";
import { Role } from "@/types";
import type { AdminUser, SystemStats, PlatformTokenInfo } from "@/types";
import AdminLoading from "./loading";
import { Users } from "lucide-react";

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
    return <AdminLoading />;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex items-center gap-2.5">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-violet-500/10 ring-1 ring-violet-500/20">
          <Users className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <p className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">Administration</p>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight leading-tight">Admin Dashboard</h1>
        </div>
      </div>

      {stats && <SystemStatsCards stats={stats} />}

      <QuotaSettings defaultQuotaBytes={defaultQuotaBytes} onRefresh={refresh} />

      <UserTable users={users} currentUserId={user.id} defaultQuotaBytes={defaultQuotaBytes} onRefresh={refresh} />

      <TokenManagement tokens={tokens} onRefresh={refresh} />

      <FeedbackList />

      <AuditLog />
    </div>
  );
}
