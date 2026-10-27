"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatBytes, formatDateShort, formatRelativeTime } from "@/lib/utils";
import { formatQuotaDisplay } from "@/lib/quota";
import { countryName } from "@/lib/geo";
import { parseUserAgent } from "@/lib/user-agent";
import type { AdminList } from "@/hooks/useAdminList";
import type { CountryCount } from "@/lib/api";
import type { AdminUser, PlanConfig } from "@/types";
import {
  DataTable,
  TableFilter,
  TableSearch,
  type DataTableColumn,
} from "@/components/admin/data-table";
import { BulkActionBar } from "@/components/admin/bulk-action-bar";
import { LocationCell } from "@/components/admin/location-cell";
import { useUserActions } from "@/components/admin/user-actions";
import { RoleBadge, PlanBadge } from "@/components/admin/badges";
import { Eye, ShieldCheck, Users } from "@/lib/icons";

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

/** The users table: search, filters, sortable columns, row menu and bulk actions. */
export function UserTable({
  list,
  users,
  total,
  loading,
  fetching,
  error,
  onRetry,
  currentUserId,
  defaultQuotaBytes,
  planConfigs,
  countries,
  onRefresh,
}: {
  list: AdminList;
  users: AdminUser[];
  total: number;
  loading: boolean;
  fetching: boolean;
  error: boolean;
  onRetry: () => void;
  currentUserId: string;
  defaultQuotaBytes: number;
  planConfigs: PlanConfig[];
  countries: CountryCount[];
  onRefresh: () => void;
}) {
  const t = useTranslations("admin.userTable");
  const tl = useTranslations("admin.location");
  const tu = useTranslations("admin.users");
  const tRoles = useTranslations("admin.roles");
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const actions = useUserActions({ currentUserId, planConfigs, onDone: onRefresh });

  const quotaOf = (u: AdminUser) =>
    formatQuotaDisplay(u.storage_quota ?? null, {
      planDisplay: planConfigs.find((p) => p.id === (u.plan || "free"))?.storage_display,
      defaultBytes: defaultQuotaBytes,
    });

  const columns: DataTableColumn<AdminUser>[] = [
    {
      id: "user",
      header: t("colUser"),
      sortKey: "username",
      cell: (u) => (
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-2)] text-[11px] font-semibold text-[var(--color-text-secondary)] ring-1 ring-[var(--color-border)]"
          >
            {initials(u.username)}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-accent)]">
              <span className="truncate">{u.username}</span>
              {u.id === currentUserId && (
                <span className="text-[10px] font-normal text-[var(--color-text-muted)]">
                  {t("you")}
                </span>
              )}
              {u.totp_enabled && (
                <ShieldCheck
                  className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]"
                  aria-label="2FA"
                />
              )}
            </span>
            <span className="block truncate text-xs text-[var(--color-text-muted)]">{u.email}</span>
          </span>
        </span>
      ),
    },
    {
      id: "location",
      header: tl("column"),
      sortKey: "country",
      className: "max-w-[14rem]",
      cell: (u) => <LocationCell user={u} />,
    },
    {
      id: "access",
      header: tu("colAccess"),
      cell: (u) => (
        <span className="flex items-center gap-1 whitespace-nowrap">
          <RoleBadge role={u.role} />
          <PlanBadge plan={u.plan || "free"} />
        </span>
      ),
    },
    {
      id: "files",
      header: t("files"),
      sortKey: "file_count",
      align: "end",
      hideBelow: "xl",
      cell: (u) => (
        <span className="tabular-nums text-[var(--color-text-secondary)]">
          {u.file_count.toLocaleString()}
        </span>
      ),
    },
    {
      id: "storage",
      header: t("usage"),
      sortKey: "total_size",
      align: "end",
      cell: (u) => (
        <span className="block tabular-nums">
          <span className="text-[var(--color-text-secondary)]">{formatBytes(u.total_size)}</span>
          <span className="block text-[11px] text-[var(--color-text-muted)]">
            {tu("ofQuota", { quota: quotaOf(u) })}
          </span>
        </span>
      ),
    },
    {
      id: "seen",
      header: tu("colLastSeen"),
      sortKey: "last_seen_at",
      hideBelow: "lg",
      cell: (u) =>
        u.last_seen_at ? (
          <span className="block">
            <span className="text-[var(--color-text-secondary)]">
              {formatRelativeTime(u.last_seen_at)}
            </span>
            {u.last_user_agent && (
              <span className="block truncate text-[11px] text-[var(--color-text-muted)]">
                {parseUserAgent(u.last_user_agent)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-[var(--color-text-muted)]">{tu("never")}</span>
        ),
    },
    {
      id: "joined",
      header: t("joined"),
      sortKey: "created_at",
      hideBelow: "xl",
      cell: (u) => (
        <span className="whitespace-nowrap tabular-nums text-[var(--color-text-muted)]">
          {formatDateShort(u.created_at)}
        </span>
      ),
    },
  ];

  const countryOptions = [
    ...countries
      .filter((c) => c.country)
      .map((c) => ({ value: c.country, label: `${countryName(c.country)} (${c.count})` })),
    { value: "unknown", label: tl("unknown") },
  ];
  const planOptions = planConfigs.map((p) => ({ value: p.id, label: p.name }));

  return (
    <>
      <DataTable
        label={t("heading")}
        title={
          <div>
            <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
              {t("heading")}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {list.q || Object.values(list.filters).some(Boolean)
                ? tu("matching", { count: total })
                : t("registered", { count: total })}
            </p>
          </div>
        }
        toolbar={
          <>
            <TableSearch list={list} placeholder={tu("search")} />
            <TableFilter list={list} name="country" label={tl("column")} options={countryOptions} />
            <TableFilter
              list={list}
              name="role"
              label={t("colRole")}
              options={[
                { value: "admin", label: tRoles("admin") },
                { value: "user", label: tRoles("user") },
              ]}
            />
            {planOptions.length > 1 && (
              <TableFilter list={list} name="plan" label={t("colPlan")} options={planOptions} />
            )}
          </>
        }
        rows={users}
        rowKey={(u) => u.id}
        columns={columns}
        list={list}
        total={total}
        loading={loading}
        fetching={fetching}
        error={error}
        onRetry={onRetry}
        empty={{
          icon: <Users className="h-7 w-7 text-[var(--color-text-muted)]" />,
          title: tu("emptyTitle"),
          description: tu("emptyDesc"),
        }}
        rowHref={(u) => `/admin/users/${u.id}`}
        rowActions={(u) =>
          actions.actionsFor(u, [
            {
              label: tu("open"),
              icon: Eye,
              onSelect: () => router.push(`/admin/users/${u.id}`),
            },
          ])
        }
        selection={{ selected, onChange: setSelected }}
      />
      {actions.dialog}
      <BulkActionBar
        selectedIds={users.filter((u) => selected.has(u.id)).map((u) => u.id)}
        currentUserId={currentUserId}
        planConfigs={planConfigs}
        onClear={() => setSelected(new Set())}
        onDone={(failedIds) => {
          setSelected(new Set(failedIds));
          onRefresh();
        }}
      />
    </>
  );
}
