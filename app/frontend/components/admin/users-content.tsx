"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { UserTable } from "@/components/admin/user-table";
import { adminListUsers, adminGetDefaultQuota, adminGetPlans } from "@/lib/api";
import { Role } from "@/types";
import type { AdminUser, PlanConfig } from "@/types";
import { UserTableSkeleton } from "@/components/admin/skeletons";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "@/lib/icons";

export function AdminUsersContent() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [defaultQuotaBytes, setDefaultQuotaBytes] = useState(0);
  const [planConfigs, setPlanConfigs] = useState<PlanConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const refresh = async () => {
    setError(false);
    try {
      const [u, q, p] = await Promise.all([
        adminListUsers(),
        adminGetDefaultQuota(),
        adminGetPlans(),
      ]);
      setUsers(u);
      setDefaultQuotaBytes(q.default_quota_bytes);
      setPlanConfigs(p.plans);
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
  if (loading) return <UserTableSkeleton />;

  if (error && users.length === 0) {
    return (
      <div className="panel p-6">
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title="Couldn't load users"
          description="We couldn't reach the server to load the user list. Check your connection and try again."
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
    <UserTable
      users={users}
      currentUserId={user.id}
      defaultQuotaBytes={defaultQuotaBytes}
      onRefresh={refresh}
      planConfigs={planConfigs}
    />
  );
}
