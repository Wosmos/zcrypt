"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  adminListReviews,
  adminUpdateReview,
  type AdminReview,
  type ReviewStatus,
} from "@/lib/api";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { useAdminList } from "@/hooks/useAdminList";
import { qk } from "@/lib/query-keys";
import { formatRelativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  BulkBar,
  DataTable,
  TableFilter,
  TableSearch,
  TableTitle,
} from "@/components/admin/data-table";
import { Stars } from "@/components/admin/feedback-list";
import { useBulkStatus } from "@/components/admin/status-bulk";
import { Check, Eye, Star, X } from "@/lib/icons";

const STATUS_KEY: Record<ReviewStatus, string> = {
  pending: "statusPending",
  approved: "statusApproved",
  rejected: "statusRejected",
};

const STATUS_VARIANT = { pending: "amber", approved: "accent", rejected: "muted" } as const;

export function Reviews() {
  const t = useTranslations("admin.reviews");
  const router = useRouter();
  const list = useAdminList("reviews", { sort: "updated_at", filters: { status: "pending" } });
  const status = (list.filters.status ?? "") as ReviewStatus | "";
  const page = useAdminQuery(qk.adminList("reviews", list.params), () =>
    adminListReviews(status, list.params),
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const bulk = useBulkStatus<ReviewStatus>(adminUpdateReview, ["admin", "list", "reviews"]);
  const rows = page.data?.reviews ?? [];
  const live = rows.filter((r) => selected.has(r.id)).map((r) => r.id);

  const apply = async (ids: string[], next: ReviewStatus) => {
    const failed = await bulk.run(ids, next, t(STATUS_KEY[next]));
    setSelected(new Set(failed));
  };

  const statusOptions = (Object.keys(STATUS_KEY) as ReviewStatus[]).map((s) => ({
    value: s,
    label: t(STATUS_KEY[s]),
  }));

  return (
    <>
      <DataTable<AdminReview>
        label={t("title")}
        title={<TableTitle icon={Star} title={t("title")} count={page.data?.total ?? 0} />}
        toolbar={
          <>
            <TableSearch list={list} placeholder={t("search")} />
            <TableFilter
              list={list}
              name="status"
              label={t("filterStatus")}
              options={statusOptions}
            />
          </>
        }
        rows={rows}
        rowKey={(r) => r.id}
        list={list}
        total={page.data?.total ?? 0}
        loading={page.loading}
        fetching={page.fetching}
        error={page.error}
        onRetry={page.refresh}
        empty={{
          icon: <Star className="h-7 w-7 text-[var(--color-text-muted)]" />,
          title: t("emptyTitle"),
          description: t("emptyAll"),
        }}
        selection={{ selected, onChange: setSelected }}
        columns={[
          {
            id: "review",
            header: t("colReview"),
            className: "min-w-[18rem]",
            cell: (r) => (
              <div className="min-w-0">
                <Stars rating={r.rating} />
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-[var(--color-text)]">
                  {r.quote}
                </p>
                <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                  {t("shownAs", {
                    name: r.display_name,
                    who: r.username || r.email || t("deletedUser"),
                    time: formatRelativeTime(r.updated_at),
                  })}
                </p>
              </div>
            ),
          },
          {
            id: "status",
            header: t("colStatus"),
            cell: (r) => (
              <span className="flex flex-wrap gap-1">
                <Badge variant={STATUS_VARIANT[r.status] ?? "muted"}>
                  {STATUS_KEY[r.status] ? t(STATUS_KEY[r.status]) : r.status}
                </Badge>
                <Badge variant={r.public_ok ? "blue" : "muted"}>
                  {r.public_ok ? t("okToShow") : t("private")}
                </Badge>
              </span>
            ),
          },
          {
            id: "rating",
            header: t("colRating"),
            sortKey: "rating",
            align: "end",
            hideBelow: "lg",
            cell: (r) => <span className="tabular-nums">{r.rating}/5</span>,
          },
          {
            id: "updated",
            header: t("colUpdated"),
            sortKey: "updated_at",
            align: "end",
            cell: (r) => (
              <span className="whitespace-nowrap text-xs tabular-nums text-[var(--color-text-muted)]">
                {formatRelativeTime(r.updated_at)}
              </span>
            ),
          },
        ]}
        rowActions={(r) => [
          {
            label: t("approve"),
            icon: Check,
            disabled: r.status === "approved",
            onSelect: () => void apply([r.id], "approved"),
          },
          {
            label: t("reject"),
            icon: X,
            disabled: r.status === "rejected",
            onSelect: () => void apply([r.id], "rejected"),
          },
          ...(r.user_id
            ? [
                {
                  label: t("openUser"),
                  icon: Eye,
                  separatorBefore: true,
                  onSelect: () => router.push(`/admin/users/${r.user_id}`),
                },
              ]
            : []),
        ]}
      />
      <BulkBar count={live.length} onClear={() => setSelected(new Set())}>
        <Button
          variant="ghost"
          size="sm"
          disabled={bulk.busy}
          onClick={() => void apply(live, "approved")}
        >
          <Check className="h-3.5 w-3.5" />
          {t("approve")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={bulk.busy}
          onClick={() => void apply(live, "rejected")}
        >
          <X className="h-3.5 w-3.5" />
          {t("reject")}
        </Button>
      </BulkBar>
    </>
  );
}
