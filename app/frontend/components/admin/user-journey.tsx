"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { adminGetUserJourney, type JourneyEvent, type JourneyFamily } from "@/lib/api";
import { JOURNEY_FAMILIES, groupByDay, localDay, metaText } from "@/lib/journey";
import { formatBytes, formatDateShort, cn } from "@/lib/utils";
import { formatPlace } from "@/lib/geo";
import { intlLocale } from "@/lib/i18n";
import { qk } from "@/lib/query-keys";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadErrorPanel } from "@/components/admin/load-error-panel";
import { CountryLabel } from "@/components/admin/location-cell";
import {
  Activity,
  AlertTriangle,
  Crown,
  HardDrive,
  LogIn,
  Share2,
  ShieldAlert,
  Upload,
  User,
} from "@/lib/icons";

const PAGE_SIZE = 30;

const FAMILY_STYLE: Record<JourneyFamily, { icon: typeof LogIn; tone: string }> = {
  auth: { icon: LogIn, tone: "text-sky-600 dark:text-sky-400 bg-sky-500/10" },
  security: { icon: ShieldAlert, tone: "text-rose-600 dark:text-rose-400 bg-rose-500/10" },
  files: { icon: Upload, tone: "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10" },
  sharing: { icon: Share2, tone: "text-violet-600 dark:text-violet-400 bg-violet-500/10" },
  storage: { icon: HardDrive, tone: "text-teal-600 dark:text-teal-400 bg-teal-500/10" },
  admin: { icon: Crown, tone: "text-amber-600 dark:text-amber-400 bg-amber-500/10" },
  account: { icon: User, tone: "text-[var(--color-text-secondary)] bg-[var(--color-surface-2)]" },
};

/** The translated name of an event kind, falling back to the kind itself. */
export function useEventLabel() {
  const t = useTranslations("admin.audit");
  return (kind: string) =>
    t.has(`events.${kind}`) ? t(`events.${kind}`) : kind.replace(/_/g, " ");
}

function EventDetail({ e }: { e: JourneyEvent }) {
  const t = useTranslations("admin.journey");
  const parts: React.ReactNode[] = [];
  if (e.kind === "uploads") {
    parts.push(t("uploadsDetail", { count: e.count ?? 0, size: formatBytes(e.bytes ?? 0) }));
  }
  if (e.actor) parts.push(t("byAdmin", { name: e.actor }));
  for (const key of ["plan", "role", "provider", "method", "platform"] as const) {
    const v = metaText(e, key);
    if (v) parts.push(v);
  }
  const reason = metaText(e, "reason");
  if (reason) parts.push(reason.replace(/_/g, " "));
  if (e.device) parts.push(e.device);
  const country = metaText(e, "country");
  if (country)
    parts.push(
      <CountryLabel key="c" code={country} className="inline-flex items-center gap-1.5" />,
    );
  const place = formatPlace(metaText(e, "city"), metaText(e, "region"));
  if (place) parts.push(place);
  if (e.ip_prefix)
    parts.push(
      <span key="ip" className="font-mono">
        {e.ip_prefix}
      </span>,
    );
  if (parts.length === 0) return null;
  return (
    <p className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-text-muted)]">
      {parts.map((p, i) => (
        <span key={i} className="inline-flex min-w-0 items-center gap-2">
          {i > 0 && (
            <span aria-hidden className="h-1 w-1 rounded-full bg-[var(--color-border-hover)]" />
          )}
          {p}
        </span>
      ))}
    </p>
  );
}

function dayHeading(
  day: string,
  today: string,
  yesterday: string,
  labels: { today: string; yesterday: string },
) {
  if (day === today) return labels.today;
  if (day === yesterday) return labels.yesterday;
  return formatDateShort(`${day}T12:00:00`);
}

/** A user's journey: everything they did and everything done to them, by day. */
export function UserJourney({ userId }: { userId: string }) {
  const t = useTranslations("admin.journey");
  const label = useEventLabel();
  const [page, setPage] = useState(1);
  const [kinds, setKinds] = useState<JourneyFamily[]>([]);
  const params = { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, kinds: kinds.join(",") };
  const q = useAdminQuery(qk.adminUserJourney(userId, params), () =>
    adminGetUserJourney(userId, params),
  );
  const data = q.data;

  const toggle = (f: JourneyFamily) => {
    setKinds((prev) => (prev.includes(f) ? prev.filter((k) => k !== f) : [...prev, f]));
    setPage(1);
  };
  const time = new Intl.DateTimeFormat(intlLocale(), { hour: "2-digit", minute: "2-digit" });
  const [now] = useState(() => Date.now());
  const today = localDay(new Date(now).toISOString());
  const yesterday = localDay(new Date(now - 86_400_000).toISOString());
  const allCount = data ? Object.values(data.families).reduce((a, b) => a + b, 0) : 0;

  return (
    <section className="panel overflow-hidden" aria-label={t("title")}>
      <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--color-text)]">
            <Activity className="h-4 w-4 text-[var(--color-text-muted)]" />
            {t("title")}
          </h3>
          {data && (
            <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
              {t("count", { count: data.total })}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("filter")}>
          <button
            type="button"
            aria-pressed={kinds.length === 0}
            onClick={() => {
              setKinds([]);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
              kinds.length === 0
                ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-text)]"
                : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)]",
            )}
          >
            {t("all")} <span className="tabular-nums opacity-60">{allCount}</span>
          </button>
          {JOURNEY_FAMILIES.map((f) => {
            const on = kinds.includes(f);
            const n = data?.families[f] ?? 0;
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(f)}
                disabled={n === 0 && !on}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40",
                  on
                    ? "border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 text-[var(--color-text)]"
                    : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-1)]",
                )}
              >
                {t(`family.${f}`)} <span className="tabular-nums opacity-60">{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      {q.loading ? (
        <div className="space-y-4 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/3 rounded-md" />
                <Skeleton className="h-3 w-1/2 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      ) : q.error && !data ? (
        <div className="p-4">
          <LoadErrorPanel
            icon={<AlertTriangle className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title={t("errorTitle")}
            description={t("errorDesc")}
            onRetry={q.refresh}
          />
        </div>
      ) : !data || data.events.length === 0 ? (
        <EmptyState
          icon={<Activity className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title={t("emptyTitle")}
          description={kinds.length ? t("emptyFiltered") : t("emptyDesc")}
        />
      ) : (
        <ol className={cn("transition-opacity", q.fetching && "opacity-60")}>
          {groupByDay(data.events).map((g) => (
            <li key={g.day}>
              <h4 className="sticky top-0 z-[1] border-b border-[var(--color-border)] bg-[var(--color-surface-1)]/90 px-5 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] backdrop-blur">
                {dayHeading(g.day, today, yesterday, {
                  today: t("today"),
                  yesterday: t("yesterday"),
                })}
              </h4>
              <ol className="relative px-5 py-2 before:absolute before:bottom-4 before:start-[2.25rem] before:top-4 before:w-px before:bg-[var(--color-border)]">
                {g.events.map((e) => {
                  const style = FAMILY_STYLE[e.family] ?? FAMILY_STYLE.account;
                  const Icon = style.icon;
                  return (
                    <li key={e.id} className="relative flex items-start gap-3 py-2">
                      <span
                        className={cn(
                          "relative z-[1] flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ring-4 ring-[var(--color-surface)]",
                          style.tone,
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1 pt-1">
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          {label(e.kind)}
                        </p>
                        <EventDetail e={e} />
                      </div>
                      <time
                        dateTime={e.created_at}
                        className="flex-shrink-0 pt-1.5 text-xs tabular-nums text-[var(--color-text-muted)]"
                      >
                        {time.format(new Date(e.created_at))}
                      </time>
                    </li>
                  );
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}

      {data && data.total > PAGE_SIZE && (
        <div className="border-t border-[var(--color-border)] px-5 py-3">
          <Pagination
            currentPage={page}
            totalPages={Math.ceil(data.total / PAGE_SIZE)}
            onPageChange={setPage}
            totalItems={data.total}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}
    </section>
  );
}
