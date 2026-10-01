"use client";

import { UserTable } from "@/components/admin/user-table";
import { adminListUsers, adminGetDefaultQuota, adminGetPlans } from "@/lib/api";
import { Role } from "@/types";
import { UserTableSkeleton } from "@/components/admin/skeletons";
import { LoadErrorPanel } from "@/components/admin/load-error-panel";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { qk } from "@/lib/query-keys";
import { AlertTriangle } from "@/lib/icons";

export function AdminUsersContent() {
  const { user, data, loading, error, refresh } = useAdminQuery(qk.adminUsers, async () => {
    const [users, q, p] = await Promise.all([
      adminListUsers(),
      adminGetDefaultQuota(),
      adminGetPlans(),
    ]);
    return { users, defaultQuotaBytes: q.default_quota_bytes, planConfigs: p.plans };
  });
  const users = data?.users ?? [];
  const defaultQuotaBytes = data?.defaultQuotaBytes ?? 0;
  const planConfigs = data?.planConfigs ?? [];

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
