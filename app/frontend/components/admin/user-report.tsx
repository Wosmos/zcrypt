"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  adminRevokeUserSession,
  type AdminSession,
  type AdminUserReport,
  type RiskFlag,
} from "@/lib/api";
import { formatBytes, formatDateShort, formatRelativeTime, cn } from "@/lib/utils";
import { formatPlace } from "@/lib/geo";
import { formatQuotaDisplay } from "@/lib/quota";
import { toast } from "@/store/toast";
import {
  CHART_TOOLTIP_CURSOR,
  CHART_TOOLTIP_LABEL_STYLE,
  CHART_TOOLTIP_STYLE,
} from "@/components/analytics/chart-theme";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { BreakdownList } from "@/components/admin/breakdown-list";
import { CountryLabel } from "@/components/admin/location-cell";
import { LogOut, Monitor, Smartphone } from "@/lib/icons";

const SEVERITY_DOT = {
  high: "bg-red-500",
  medium: "bg-amber-500",
  low: "bg-[var(--color-text-muted)]",
} as const;

/** One translated sentence for a risk flag. */
export function useRiskLabel() {
  const t = useTranslations("admin.report");
  return (code: RiskFlag["code"] | string, value?: number) =>
    t.has(`risk.${code}`) ? t(`risk.${code}`, { count: value ?? 0 }) : code;
}

function Panel({
  title,
  aside,
  children,
  className,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel p-5", className)}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 bg-[var(--color-surface)] px-4 py-3">
      <dt className="truncate text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 truncate font-heading text-lg font-semibold tabular-nums text-[var(--color-text)]">
        {value}
      </dd>
      {sub && (
        <dd className="truncate text-[11px] tabular-nums text-[var(--color-text-muted)]">{sub}</dd>
      )}
    </div>
  );
}

function SessionRow({ s, onRevoke }: { s: AdminSession; onRevoke: () => void }) {
  const t = useTranslations("admin.report");
  const Icon = /Android|iPhone|iPad|Mobile/.test(s.user_agent) ? Smartphone : Monitor;
  const place = formatPlace(s.city, s.region);
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-1)] ring-1 ring-[var(--color-border)]">
        <Icon className="h-4 w-4 text-[var(--color-text-secondary)]" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <p className="truncate font-medium text-[var(--color-text)]">
          {s.device || t("unknownDevice")}
        </p>
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 text-xs text-[var(--color-text-muted)]">
          {s.country ? (
            <CountryLabel code={s.country} className="inline-flex min-w-0 items-center gap-1.5" />
          ) : null}
          {place && <span className="truncate">{place}</span>}
          {s.ip_prefix && <span className="font-mono">{s.ip_prefix}</span>}
        </p>
      </div>
      <div className="hidden flex-shrink-0 text-end text-xs sm:block">
        <p className="text-[var(--color-text-secondary)]">
          {t("activeAgo", { time: formatRelativeTime(s.last_active) })}
        </p>
        <p className="text-[var(--color-text-muted)]">
          {t("since", { date: formatDateShort(s.started_at) })}
        </p>
      </div>
      <button
        type="button"
        onClick={onRevoke}
        className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-red-500/10 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 dark:hover:text-red-400"
      >
        <LogOut className="h-3.5 w-3.5" />
        {t("signOut")}
      </button>
    </li>
  );
}

/** The report half of a user's page: numbers, charts, risk flags and live sessions. */
export function UserReport({
  report,
  onChanged,
}: {
  report: AdminUserReport;
  onChanged: () => void;
}) {
  const t = useTranslations("admin.report");
  const riskLabel = useRiskLabel();
  const [revoke, setRevoke] = useState<AdminSession | null>(null);
  const [busy, setBusy] = useState(false);
  const st = report.stats;
  const u = report.user;
  const lastActive = [st.last_active_at, u.last_seen_at]
    .filter((v): v is string => Boolean(v))
    .sort()
    .pop();

  const doRevoke = async () => {
    if (!revoke) return;
    setBusy(true);
    try {
      await adminRevokeUserSession(u.id, revoke.id);
      toast.success(t("signedOut"), { detail: revoke.device || undefined });
      setRevoke(null);
      onChanged();
    } catch (err) {
      toast.error(t("signOutFailed"), { detail: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const total30 = st.activity.reduce((n, d) => n + d.count, 0);

  return (
    <div className="space-y-4">
      <div className="panel overflow-hidden">
        <dl className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
          <Stat
            label={t("accountAge")}
            value={t("days", { count: report.account_age_days })}
            sub={formatDateShort(u.created_at)}
          />
          <Stat
            label={t("daysActive")}
            value={st.days_active.toLocaleString()}
            sub={
              lastActive
                ? t("lastActive", { time: formatRelativeTime(lastActive) })
                : t("neverActive")
            }
          />
          <Stat
            label={t("storage")}
            value={formatBytes(report.used_bytes)}
            sub={t("ofQuota", { quota: formatQuotaDisplay(report.quota_bytes) })}
          />
          <Stat label={t("files")} value={u.file_count.toLocaleString()} />
          <Stat label={t("shares")} value={st.shares.toLocaleString()} />
          <Stat label={t("spaces")} value={st.spaces.toLocaleString()} />
          <Stat
            label={t("signIns7d")}
            value={st.sign_ins_7d.toLocaleString()}
            sub={t("failed7d", { count: st.failed_signins_7d })}
          />
          <Stat
            label={t("countries7d")}
            value={st.countries_7d.length.toLocaleString()}
            sub={st.countries_7d.join(", ")}
          />
        </dl>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <Panel
          title={t("activity30")}
          aside={
            <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
              {t("events", { count: total30 })}
            </span>
          }
          className="lg:col-span-3"
        >
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={st.activity} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis hide allowDecimals={false} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                  cursor={{ fill: "var(--color-surface-2)" }}
                  labelFormatter={(d) => formatDateShort(String(d))}
                />
                <Bar
                  dataKey="count"
                  name={t("eventsLabel")}
                  fill="var(--color-accent)"
                  radius={[3, 3, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title={t("risks")} className="lg:col-span-2">
          {report.risk_flags.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("noRisks")}</p>
          ) : (
            <ul className="space-y-2.5">
              {report.risk_flags.map((f) => (
                <li key={f.code} className="flex items-start gap-2.5 text-sm">
                  <span
                    className={cn(
                      "mt-1.5 h-2 w-2 flex-shrink-0 rounded-full",
                      SEVERITY_DOT[f.severity],
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0">
                    <span className="text-[var(--color-text)]">{riskLabel(f.code, f.value)}</span>
                    <span className="ms-2 text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      {t(`severity.${f.severity}`)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title={t("storageOverTime")} className="lg:col-span-1">
          {report.storage_growth.length < 2 ? (
            <p className="text-sm text-[var(--color-text-muted)]">{t("noGrowth")}</p>
          ) : (
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={report.storage_growth}
                  margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
                >
                  <defs>
                    <linearGradient id="growthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis dataKey="bucket" hide />
                  <YAxis hide />
                  <Tooltip
                    contentStyle={CHART_TOOLTIP_STYLE}
                    labelStyle={CHART_TOOLTIP_LABEL_STYLE}
                    cursor={CHART_TOOLTIP_CURSOR}
                    labelFormatter={(d) => formatDateShort(String(d))}
                    formatter={(v) => formatBytes(Number(v))}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumulative_bytes"
                    name={t("storage")}
                    stroke="var(--color-accent)"
                    fill="url(#growthFill)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>
        <Panel title={t("filesByType")}>
          <BreakdownList
            rows={st.files_by_type.map((r) => ({
              key: r.label,
              label:
                r.label === "sealed"
                  ? t("sealedNames")
                  : r.label === "none"
                    ? t("noExtension")
                    : `.${r.label}`,
              count: r.count,
              extra: formatBytes(r.bytes),
            }))}
            empty={t("noFiles")}
          />
        </Panel>
        <Panel title={t("platforms")}>
          <BreakdownList
            rows={st.platforms.map((r) => ({
              key: r.label,
              label: r.label,
              count: r.count,
              extra: formatBytes(r.bytes),
            }))}
            empty={t("noPlatforms")}
          />
        </Panel>
      </div>

      <Panel
        title={t("sessions")}
        aside={
          <span className="text-xs tabular-nums text-[var(--color-text-muted)]">
            {t("sessionCount", { count: report.sessions.length })}
          </span>
        }
      >
        {report.sessions.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)]">{t("noSessions")}</p>
        ) : (
          <ul className="-my-3 divide-y divide-[var(--color-border)]">
            {report.sessions.map((s) => (
              <SessionRow key={s.id} s={s} onRevoke={() => setRevoke(s)} />
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmModal
        open={revoke !== null}
        onClose={() => setRevoke(null)}
        onConfirm={doRevoke}
        title={t("signOutTitle")}
        description={t("signOutDesc", { username: u.username })}
        details={revoke?.device || undefined}
        confirmLabel={t("signOut")}
        variant="warning"
        loading={busy}
      />
    </div>
  );
}
