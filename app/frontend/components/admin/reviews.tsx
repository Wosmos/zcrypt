"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { adminListReviews, adminUpdateReview, type ReviewStatus } from "@/lib/api";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { formatRelativeTime } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Star } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { SkeletonRow } from "@/components/ui/skeletons";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 20;

const STATUSES: { value: ReviewStatus; key: string }[] = [
  { value: "pending", key: "statusPending" },
  { value: "approved", key: "statusApproved" },
  { value: "rejected", key: "statusRejected" },
];

const STATUS_KEY: Record<ReviewStatus, string> = {
  pending: "statusPending",
  approved: "statusApproved",
  rejected: "statusRejected",
};

const STATUS_VARIANT = { pending: "amber", approved: "accent", rejected: "muted" } as const;

function Stars({ rating }: { rating: number }) {
  const t = useTranslations("admin.feedback");
  return (
    <span className="inline-flex" role="img" aria-label={t("stars", { rating })}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={
            n <= rating
              ? "h-3.5 w-3.5 [&_path]:fill-current text-[var(--color-accent)]"
              : "h-3.5 w-3.5 text-[var(--color-text-muted)]"
          }
        />
      ))}
    </span>
  );
}

export function Reviews() {
  const t = useTranslations("admin.reviews");
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<ReviewStatus | "">("pending");

  const { data, loading } = useAdminQuery(qk.adminReviews(status, page * PAGE_SIZE), () =>
    adminListReviews(status, PAGE_SIZE, page * PAGE_SIZE),
  );

  const reviews = data?.reviews ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const moderate = async (id: string, next: ReviewStatus) => {
    try {
      await adminUpdateReview(id, next);
      await queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("updateFailed"));
    }
  };

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Star className="h-4 w-4 text-[var(--color-text-muted)]" />
          <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
            {t("title")}
          </h2>
          <span className="text-xs text-[var(--color-text-muted)] tabular-nums">({total})</span>
        </div>
        <div className="sm:w-44">
          <Select
            value={status || "all"}
            onValueChange={(v) => {
              setStatus(v === "all" ? "" : (v as ReviewStatus));
              setPage(0);
            }}
          >
            <SelectTrigger className="h-9 text-xs" aria-label={t("filterStatus")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("allStatuses")}</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {t(s.key)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="divide-y divide-[var(--color-border)] px-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={<Star className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title={t("emptyTitle")}
          description={status ? t("emptyFiltered") : t("emptyAll")}
        />
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {reviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Stars rating={r.rating} />
                  <Badge variant={STATUS_VARIANT[r.status] ?? "muted"}>
                    {STATUS_KEY[r.status] ? t(STATUS_KEY[r.status]) : r.status}
                  </Badge>
                  <Badge variant={r.public_ok ? "blue" : "muted"}>
                    {r.public_ok ? t("okToShow") : t("private")}
                  </Badge>
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[var(--color-text)]">
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
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  disabled={r.status === "approved"}
                  onClick={() => void moderate(r.id, "approved")}
                >
                  {t("approve")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={r.status === "rejected"}
                  onClick={() => void moderate(r.id, "rejected")}
                >
                  {t("reject")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > PAGE_SIZE && (
        <Pagination
          currentPage={page + 1}
          totalPages={totalPages}
          onPageChange={(p) => setPage(p - 1)}
          totalItems={total}
          pageSize={PAGE_SIZE}
        />
      )}
    </section>
  );
}
