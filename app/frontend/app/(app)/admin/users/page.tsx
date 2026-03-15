"use client";

import { useEffect, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { UserTable } from "@/components/admin/user-table";
import { adminListUsers, adminGetDefaultQuota, adminGetPlans } from "@/lib/api";
import { Role } from "@/types";
import type { AdminUser, PlanConfig } from "@/types";

export default function AdminUsersPage() {
  const { user } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [defaultQuotaBytes, setDefaultQuotaBytes] = useState(0);
  const [planConfigs, setPlanConfigs] = useState<PlanConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
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
      // ignore
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
  if (loading) return null;

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
