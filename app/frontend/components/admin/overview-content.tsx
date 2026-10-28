"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState, type ComponentType, type ReactNode } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AdminOverview } from "@/lib/api";
import { formatBytes, formatDateShort, formatRelativeTime, cn } from "@/lib/utils";
import { countryName } from "@/lib/geo";
import { Role } from "@/types";
import { qk } from "@/lib/query-keys";
import { useAdminQuery, fetchAdminOverview } from "@/hooks/useAdminGuardedFetch";
import {
  CHART_TOOLTIP_CURSOR,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from "@/components/analytics/chart-theme";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Skeleton } from "@/components/ui/skeleton";
import { DurabilityAlert } from "@/components/admin/system-stats";
import { TokenManagement } from "@/components/admin/token-management";
import { AdminSendStorage } from "@/components/admin/send-storage";
import { FeedbackList } from "@/components/admin/feedback-list";
import { LoadErrorPanel } from "@/components/admin/load-error-panel";
import { BreakdownList } from "@/components/admin/breakdown-list";
import { CountryLabel } from "@/components/admin/location-cell";
import { useEventLabel } from "@/components/admin/user-journey";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Database,
  FileText,
  Globe,
  Mail,
  ShieldAlert,
  Star,
  Trash2,
  UserPlus,
  Users,
} from "@/lib/icons";

type IconComponent = ComponentType<{ className?: string }>;

function Tile({
  label,
  value,
  sub,
  icon: Icon,
  href,
  tone,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  icon: IconComponent;
  href?: string;
  tone?: "warn";
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
          {label}
        </span>
        <Icon
          className={cn(
            "h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)] transition-colors",
            href && "group-hover:text-[var(--color-accent)]",
            tone === "warn" && "text-amber-500",
          )}
        />
      </div>
      <div className="min-w-0">
        <p className="truncate font-heading text-2xl font-semibold tabular-nums tracking-tight text-[var(--color-text)]">
          {value}
        </p>
        {sub && (
          <p className="mt-0.5 truncate text-xs tabular-nums text-[var(--color-text-muted)]">
            {sub}
          </p>
        )}
      </div>
    </>
  );
  const cls =
    "group relative flex min-w-0 flex-col justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4";
  if (!href) return <div className={cls}>{body}</div>;
  return (
    <Link
      href={href}
      className={cn(
        cls,
        "transition-colors hover:border-[var(--color-accent)]/30 hover:bg-[var(--color-surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
      )}
    >
      {body}
    </Link>
  );
}

function Card({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel flex min-w-0 flex-col p-5", className)}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function SeeAll({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
    >
      {label}
      <ArrowRight className="h-3 w-3 rtl:rotate-180" />
    </Link>
  );
}

function trendLabel(now: number, before: number) {
  if (before === 0) return now > 0 ? "+" + now : "0";
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

function ActivityChart({ o }: { o: AdminOverview }) {
  const t = useTranslations("admin.overview");
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={o.series} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11 }}
            stroke="var(--color-text-muted)"
            tickFormatter={(d: string) => formatDateShort(`${d}T12:00:00`).replace(/,? \d{4}$/, "")}
            minTickGap={28}
          />
          <YAxis tick={{ fontSize: 11 }} stroke="var(--color-text-muted)" allowDecimals={false} />
          <Tooltip
            contentStyle={CHART_TOOLTIP_STYLE}
            labelStyle={CHART_TOOLTIP_LABEL_STYLE}
            cursor={CHART_TOOLTIP_CURSOR}
            labelFormatter={(d) => formatDateShort(`${String(d)}T12:00:00`)}
          />
          <Bar
            dataKey="signups"
            name={t("chartSignups")}
            fill="var(--color-accent)"
            fillOpacity={0.55}
            radius={[3, 3, 0, 0]}
            maxBarSize={14}
          />
          <Line
            type="monotone"
            dataKey="active"
            name={t("chartActive")}
            stroke="var(--color-text-secondary)"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function OverviewSkeletonGrid() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-2xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-[1.25rem]" />
    </div>
  );
}

export function AdminOverviewContent() {
  const t = useTranslations("admin.overview");
  const eventLabel = useEventLabel();
  const [days, setDays] = useState(30);
  const { user, data, loading, error, refresh } = useAdminQuery(qk.adminOverview(days), () =>
    fetchAdminOverview(days),
  );

  if (!user || user.role !== Role.Admin) return null;
  if (loading && !data) return <OverviewSkeletonGrid />;
  if (error && !data) {
    return (
      <LoadErrorPanel
        icon={<AlertTriangle className="h-7 w-7 text-[var(--color-text-muted)]" />}
        title={t("errorTitle")}
        description={t("errorDesc")}
        onRetry={refresh}
      />
    );
  }
  if (!data) return null;

  const { overview: o, stats } = data;
  const topCountry = o.countries.find((c) => c.country)?.country;
  const health = (stats.degraded_files ?? 0) + (stats.damaged_files ?? 0);
  const attention = [
    {
      key: "damaged",
      count: stats.damaged_files ?? 0,
      label: t("attnDamaged", { count: stats.damaged_files ?? 0 }),
      href: undefined,
      icon: ShieldAlert,
    },
    {
      key: "stuck",
      count: stats.stuck_chunks ?? 0,
      label: t("attnStuck", { count: stats.stuck_chunks ?? 0 }),
      href: undefined,
      icon: Database,
    },
    {
      key: "emails",
      count: o.emails_failed_30d,
      label: t("attnEmails", { count: o.emails_failed_30d }),
      href: "/admin/emails",
      icon: Mail,
    },
    {
      key: "reports",
      count: o.stale_bug_reports,
      label: t("attnReports", { count: o.stale_bug_reports }),
      href: "/admin/reports",
      icon: AlertTriangle,
    },
    {
      key: "reviews",
      count: o.pending_reviews,
      label: t("attnReviews", { count: o.pending_reviews }),
      href: "/admin/reviews",
      icon: Star,
    },
    {
      key: "deletions",
      count: o.pending_deletions,
      label: t("attnDeletions", { count: o.pending_deletions }),
      href: undefined,
      icon: Trash2,
    },
  ].filter((a) => a.count > 0);

  return (
    <div className="space-y-6">
      <DurabilityAlert stats={stats} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Tile
          label={t("tileUsers")}
          value={o.total_users.toLocaleString()}
          sub={t("tileUsersSub", { count: o.active_30d })}
          icon={Users}
          href="/admin/users"
        />
        <Tile
          label={t("tileActive")}
          value={o.active_7d.toLocaleString()}
          sub={t("tileActiveSub", {
            pct: o.total_users ? Math.round((o.active_7d / o.total_users) * 100) : 0,
          })}
          icon={Activity}
          href="/admin/users?sort=last_seen_at"
        />
        <Tile
          label={t("tileSignups")}
          value={o.signups_this_week.toLocaleString()}
          sub={t("tileSignupsSub", {
            trend: trendLabel(o.signups_this_week, o.signups_last_week),
            before: o.signups_last_week,
          })}
          icon={UserPlus}
          href="/admin/users"
        />
        <Tile
          label={t("tileStorage")}
          value={formatBytes(o.total_size)}
          sub={t("tileFilesSub", { count: o.total_files })}
          icon={Database}
          href="/admin/users"
        />
        <Tile
          label={t("tileHealth")}
          value={health.toLocaleString()}
          sub={t("tileHealthSub", {
            damaged: stats.damaged_files ?? 0,
            degraded: stats.degraded_files ?? 0,
          })}
          icon={ShieldAlert}
          tone={health > 0 ? "warn" : undefined}
        />
        <Tile
          label={t("tileReports")}
          value={o.open_bug_reports.toLocaleString()}
          sub={t("tileReportsSub", { count: o.stale_bug_reports })}
          icon={AlertTriangle}
          href="/admin/reports"
          tone={o.stale_bug_reports > 0 ? "warn" : undefined}
        />
        <Tile
          label={t("tileReviews")}
          value={o.pending_reviews.toLocaleString()}
          sub={t("tileReviewsSub")}
          icon={Star}
          href="/admin/reviews"
        />
        <Tile
          label={t("tileEmails")}
          value={o.emails_queued.toLocaleString()}
          sub={t("tileEmailsSub", { count: o.emails_sending })}
          icon={Mail}
          href="/admin/emails"
        />
        <Tile
          label={t("tileFiles")}
          value={o.total_files.toLocaleString()}
          sub={t("tileReposSub", { count: stats.total_repos })}
          icon={FileText}
          href="/admin/users?sort=file_count"
        />
        <Tile
          label={t("tileCountries")}
          value={o.countries.filter((c) => c.country).length.toLocaleString()}
          sub={topCountry ? countryName(topCountry) : t("noCountries")}
          icon={Globe}
          href="/admin/users"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title={t("chartTitle")}
          className="xl:col-span-2"
          action={
            <ToggleGroup
              type="single"
              value={String(days)}
              onValueChange={(v) => v && setDays(Number(v))}
              aria-label={t("chartRange")}
            >
              {[30, 90].map((d) => (
                <ToggleGroupItem key={d} value={String(d)} aria-label={t("lastDays", { days: d })}>
                  {t("lastDays", { days: d })}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          }
        >
          <div className="mb-3 flex flex-wrap gap-4 text-xs text-[var(--color-text-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[var(--color-accent)] opacity-60" />
              {t("chartSignups")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-0.5 w-3 rounded bg-[var(--color-text-secondary)]" />
              {t("chartActive")}
            </span>
          </div>
          <ActivityChart o={o} />
        </Card>

        <Card
          title={t("countriesTitle")}
          action={<SeeAll href="/admin/users" label={t("seeAll")} />}
        >
          <BreakdownList
            rows={o.countries.map((c) => ({
              key: c.country || "unknown",
              label: c.country ? <CountryLabel code={c.country} /> : t("unknownCountry"),
              count: c.count,
              href: `/admin/users?country=${c.country || "unknown"}`,
            }))}
            empty={t("noCountries")}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t("attentionTitle")}>
          {attention.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("attentionNone")}</p>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {attention.map((a) => (
                <li key={a.key}>
                  {a.href ? (
                    <Link
                      href={a.href}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-[var(--color-surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                    >
                      <a.icon className="h-4 w-4 flex-shrink-0 text-amber-500" />
                      <span className="min-w-0 flex-1 truncate text-[var(--color-text)]">
                        {a.label}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)] rtl:rotate-180" />
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-2 py-2 text-sm">
                      <a.icon className="h-4 w-4 flex-shrink-0 text-amber-500" />
                      <span className="min-w-0 flex-1 truncate text-[var(--color-text)]">
                        {a.label}
                      </span>
                    </div>
                  )}
                </li>
              ))}
              {o.stale_reports.map((r) => (
                <li key={r.id}>
                  <Link
                    href="/admin/reports"
                    className="ms-7 flex items-baseline gap-2 rounded-lg px-2 py-1 text-xs text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-1)]"
                  >
                    <span className="min-w-0 flex-1 truncate">{r.description}</span>
                    <span className="flex-shrink-0 tabular-nums">
                      {formatRelativeTime(r.created_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={t("recentTitle")}
          action={<SeeAll href="/admin/audit-logs" label={t("seeAll")} />}
        >
          {o.recent.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("recentNone")}</p>
          ) : (
            <ul className="-mx-2 space-y-0.5">
              {o.recent.map((e) => {
                const body = (
                  <>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="text-[var(--color-text)]">{eventLabel(e.event_type)}</span>
                      <span className="text-[var(--color-text-muted)]">
                        {" "}
                        · {e.username || t("someone")}
                      </span>
                    </span>
                    {e.country && (
                      <span className="flex-shrink-0 font-mono text-[10px] text-[var(--color-text-muted)]">
                        {e.country}
                      </span>
                    )}
                    <span className="w-16 flex-shrink-0 text-end text-xs tabular-nums text-[var(--color-text-muted)]">
                      {formatRelativeTime(e.created_at)}
                    </span>
                  </>
                );
                const cls = "flex items-center gap-3 rounded-lg px-2 py-2 text-sm";
                return (
                  <li key={e.id}>
                    {e.user_id && e.username ? (
                      <Link
                        href={`/admin/users/${e.user_id}`}
                        className={cn(
                          cls,
                          "transition-colors hover:bg-[var(--color-surface-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40",
                        )}
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className={cls}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <TokenManagement />
      <AdminSendStorage />
      <FeedbackList />
    </div>
  );
}
