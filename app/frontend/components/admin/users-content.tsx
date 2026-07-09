"use client";

import { useCallback, useState } from "react";
import { UserTable } from "@/components/admin/user-table";
import { adminListUsers, adminGetDefaultQuota, adminGetPlans } from "@/lib/api";
import { Role } from "@/types";
import type { AdminUser, PlanConfig } from "@/types";
import { UserTableSkeleton } from "@/components/admin/skeletons";
import { LoadErrorPanel } from "@/components/admin/load-error-panel";
import { useAdminGuardedFetch } from "@/hooks/useAdminGuardedFetch";
import { AlertTriangle } from "@/lib/icons";

export function AdminUsersContent() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [defaultQuotaBytes, setDefaultQuotaBytes] = useState(0);
  const [planConfigs, setPlanConfigs] = useState<PlanConfig[]>([]);

  const fetcher = useCallback(async () => {
    const [u, q, p] = await Promise.all([
      adminListUsers(),
      adminGetDefaultQuota(),
      adminGetPlans(),
    ]);
    setUsers(u);
    setDefaultQuotaBytes(q.default_quota_bytes);
    setPlanConfigs(p.plans);
  }, []);
  const { user, loading, error, refresh } = useAdminGuardedFetch(fetcher);

  if (!user || user.role !== Role.Admin) return null;
  if (loading) return <UserTableSkeleton />;

  if (error && users.length === 0) {
    return (
      <LoadErrorPanel
        icon={<AlertTriangle className="h-7 w-7 text-[var(--color-text-muted)]" />}
        title="Couldn't load users"
        description="We couldn't reach the server to load the user list. Check your connection and try again."
        onRetry={refresh}
      />
    );
  }

  return (
    <UserTable
      users={users}
      currentUserId={user.id}
      defaultQuotaBytes={defaultQuotaBytes}
      onRefresh={refresh}
      planConfigs={planConfigs}
    />
  );
}
