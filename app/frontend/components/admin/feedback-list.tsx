"use client";

import { useTranslations } from "next-intl";
import { adminListFeedback } from "@/lib/api";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { useAdminList } from "@/hooks/useAdminList";
import { qk } from "@/lib/query-keys";
import { cn, formatDateShort } from "@/lib/utils";
import { DataTable, TableSearch } from "@/components/admin/data-table";
import { Star, MessageSquare } from "@/lib/icons";

/** Five stars, the first `rating` filled. */
export function Stars({ rating }: { rating: number }) {
  const t = useTranslations("admin.feedback");
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role="img"
      aria-label={t("stars", { rating })}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={cn(
            "h-3.5 w-3.5",
            star <= rating ? "fill-amber-400 text-amber-400" : "text-[var(--color-border-hover)]",
          )}
        />
      ))}
    </span>
  );
}

export function FeedbackList() {
  const t = useTranslations("admin.feedback");
  const list = useAdminList("feedback", { sort: "created_at", pageSize: 10 });
  const page = useAdminQuery(qk.adminList("feedback", list.params), () =>
    adminListFeedback(list.params),
  );
  const total = page.data?.total ?? 0;
  const avg = page.data?.average_rating ?? 0;

  return (
    <DataTable
      label={t("title")}
      title={
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10">
            <MessageSquare className="h-4 w-4 text-amber-500" />
          </span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
              {t("title")}
            </h3>
            <p className="text-xs text-[var(--color-text-muted)]">
              {t("responses", { count: total })}
              {avg > 0 && <span className="ms-2">{t("avg", { value: avg.toFixed(1) })}</span>}
            </p>
          </div>
        </div>
      }
      toolbar={<TableSearch list={list} placeholder={t("search")} />}
      rows={page.data?.feedback ?? []}
      rowKey={(f) => f.id}
      list={list}
      total={total}
      loading={page.loading}
      fetching={page.fetching}
      error={page.error}
      onRetry={page.refresh}
      empty={{
        icon: <MessageSquare className="h-7 w-7 text-[var(--color-text-muted)]" />,
        title: t("emptyTitle"),
        description: t("emptyDesc"),
      }}
      rowHref={(f) => `/admin/users/${f.user_id}`}
      columns={[
        {
          id: "user",
          header: t("colUser"),
          cell: (f) => (
            <span className="block min-w-0">
              <span className="block truncate text-sm font-medium text-[var(--color-text)] group-hover:text-[var(--color-accent)]">
                {f.username}
              </span>
              <span className="block truncate text-xs text-[var(--color-text-muted)]">
                {f.email}
              </span>
            </span>
          ),
        },
        {
          id: "rating",
          header: t("colRating"),
          sortKey: "rating",
          cell: (f) => <Stars rating={f.rating} />,
        },
        {
          id: "message",
          header: t("colMessage"),
          className: "max-w-md",
          cell: (f) =>
            f.message ? (
              <span className="line-clamp-2 text-[var(--color-text-secondary)]">{f.message}</span>
            ) : (
              <span className="italic text-[var(--color-text-muted)]">{t("noMessage")}</span>
            ),
        },
        {
          id: "date",
          header: t("colDate"),
          sortKey: "created_at",
          align: "end",
          cell: (f) => (
            <span className="whitespace-nowrap tabular-nums text-xs text-[var(--color-text-muted)]">
              {formatDateShort(f.created_at)}
            </span>
          ),
        },
      ]}
    />
  );
}
