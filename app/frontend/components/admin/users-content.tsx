"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { UserTable } from "@/components/admin/user-table";
import {
  adminGetDefaultQuota,
  adminGetPlans,
  adminListUserCountries,
  adminListUsers,
} from "@/lib/api";
import { Role } from "@/types";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { useAdminList } from "@/hooks/useAdminList";
import { qk } from "@/lib/query-keys";

export function AdminUsersContent() {
  const search = useSearchParams();
  const list = useAdminList("users", { sort: "created_at" });
  const { setFilter, setSort } = list;
  const countryParam = search.get("country");
  const sortParam = search.get("sort");

  useEffect(() => {
    if (countryParam)
      setFilter("country", countryParam === "unknown" ? "unknown" : countryParam.toUpperCase());
  }, [countryParam, setFilter]);
  useEffect(() => {
    if (sortParam) setSort(sortParam, "desc");
  }, [sortParam, setSort]);

  const page = useAdminQuery(qk.adminList("users", list.params), () => adminListUsers(list.params));
  const meta = useAdminQuery(qk.adminUsersMeta, async () => {
    const [q, p, c] = await Promise.all([
      adminGetDefaultQuota(),
      adminGetPlans(),
      adminListUserCountries(),
    ]);
    return {
      defaultQuotaBytes: q.default_quota_bytes,
      planConfigs: p.plans,
      countries: c.countries,
    };
  });

  if (!page.user || page.user.role !== Role.Admin) return null;

  return (
    <UserTable
      list={list}
      users={page.data?.users ?? []}
      total={page.data?.total ?? 0}
      loading={page.loading}
      fetching={page.fetching}
      error={page.error}
      onRetry={page.refresh}
      currentUserId={page.user.id}
      defaultQuotaBytes={meta.data?.defaultQuotaBytes ?? 0}
      planConfigs={meta.data?.planConfigs ?? []}
      countries={meta.data?.countries ?? []}
      onRefresh={page.refresh}
    />
  );
}
