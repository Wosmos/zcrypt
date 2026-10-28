"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  adminGetPlans,
  adminGetUserJourney,
  adminGetUserReport,
  type AdminUserReport,
  type JourneyEvent,
} from "@/lib/api";
import { buildReportHtml, buildReportJson, type ReportLabels } from "@/lib/user-report-export";
import { countryName, displayCountry, formatPlace } from "@/lib/geo";
import {
  formatBytes,
  formatDateShort,
  formatDateTime,
  formatRelativeTime,
  saveBlob,
} from "@/lib/utils";
import { metaText } from "@/lib/journey";
import { parseUserAgent } from "@/lib/user-agent";
import { toast } from "@/store/toast";
import { Role } from "@/types";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { qk } from "@/lib/query-keys";
import { UserDetailSkeleton } from "@/components/admin/skeletons";
import { RoleBadge, PlanBadge } from "@/components/admin/badges";
import { LoadErrorPanel } from "@/components/admin/load-error-panel";
import { CountryLabel } from "@/components/admin/location-cell";
import { RowActionsMenu } from "@/components/admin/data-table";
import { useUserActions } from "@/components/admin/user-actions";
import { UserReport, useRiskLabel } from "@/components/admin/user-report";
import { UserJourney, useEventLabel } from "@/components/admin/user-journey";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Clock,
  Code,
  Download,
  FileText,
  Mail,
  MapPin,
  Shield,
  User,
} from "@/lib/icons";

const EXPORT_PAGE = 100;
const EXPORT_MAX = 1000;

async function loadJourney(userId: string): Promise<JourneyEvent[]> {
  const events: JourneyEvent[] = [];
  for (let offset = 0; offset < EXPORT_MAX; offset += EXPORT_PAGE) {
    const page = await adminGetUserJourney(userId, { limit: EXPORT_PAGE, offset });
    events.push(...page.events);
    if (events.length >= page.total || page.events.length === 0) break;
  }
  return events;
}

function useExportLabels() {
  const t = useTranslations("admin.report");
  const tj = useTranslations("admin.journey");
  const riskLabel = useRiskLabel();
  const eventLabel = useEventLabel();
  return (r: AdminUserReport): ReportLabels => ({
    title: t("exportTitle"),
    generated: t("generated"),
    account: t("account"),
    activity: t("activitySection"),
    risks: t("risks"),
    noRisks: t("noRisks"),
    sessions: t("sessions"),
    noSessions: t("noSessions"),
    journey: tj("title"),
    noJourney: tj("emptyTitle"),
    filesByType: t("filesByType"),
    platforms: t("platforms"),
    none: t("none"),
    accountRows: [
      [t("email"), r.user.email],
      [t("role"), r.user.role],
      [t("plan"), r.user.plan || "free"],
      [t("joinedOn"), formatDateShort(r.user.created_at)],
      [t("accountAge"), t("days", { count: r.account_age_days })],
      [t("signupFrom"), countryName(r.user.signup_country) || t("unknown")],
      [
        t("lastFrom"),
        [countryName(displayCountry(r.user)), formatPlace(r.user.last_city, r.user.last_region)]
          .filter(Boolean)
          .join(", ") || t("unknown"),
      ],
      [t("twoFactor"), r.user.totp_enabled ? t("yes") : t("no")],
      [t("emailVerified"), r.user.email_verified ? t("yes") : t("no")],
    ],
    activityRows: [
      [t("daysActive"), String(r.stats.days_active)],
      [t("storage"), formatBytes(r.used_bytes)],
      [t("files"), String(r.user.file_count)],
      [t("shares"), String(r.stats.shares)],
      [t("spaces"), String(r.stats.spaces)],
      [t("signIns7d"), String(r.stats.sign_ins_7d)],
      [t("failedSignins7d"), String(r.stats.failed_sign_ins_7d)],
      [t("countries7d"), r.stats.countries_7d.join(", ") || t("none")],
    ],
    riskLabel,
    severityLabel: (s) => t(`severity.${s}`),
    sessionLine: (s) =>
      [
        s.device || t("unknownDevice"),
        countryName(s.country),
        formatPlace(s.city, s.region),
        s.ip_prefix,
        formatDateTime(s.last_active),
      ]
        .filter(Boolean)
        .join(" · "),
    eventLine: (e) =>
      [formatDateTime(e.created_at), eventLabel(e.kind), e.actor, e.device, metaText(e, "country")]
        .filter(Boolean)
        .join(" · "),
    date: (iso) => formatDateTime(iso),
    bytes: formatBytes,
  });
}

export function AdminUserDetailContent() {
  const t = useTranslations("admin.userDetail");
  const tr = useTranslations("admin.report");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const exportLabels = useExportLabels();

  const report = useAdminQuery(qk.adminUserReport(id), () => adminGetUserReport(id), {
    keepPrevious: false,
  });
  const plans = useAdminQuery(qk.adminPlans, adminGetPlans);
  const currentUser = report.user;
  const actions = useUserActions({
    currentUserId: currentUser?.id ?? "",
    planConfigs: plans.data?.plans ?? [],
    onDone: report.refresh,
    onDeleted: () => router.push("/admin/users"),
  });

  if (!currentUser || currentUser.role !== Role.Admin) return null;
  if (report.loading) return <UserDetailSkeleton />;

  const back = (
    <Link
      href="/admin/users"
      className="inline-flex items-center gap-1.5 rounded-md text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
    >
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" />
      {t("back")}
    </Link>
  );

  const data = report.data;
  if (!data) {
    return (
      <div className="space-y-6">
        {back}
        <LoadErrorPanel
          icon={<User className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title={t("errorTitle")}
          description={t("errorDesc")}
          onRetry={report.refresh}
        />
      </div>
    );
  }

  const u = data.user;
  const code = displayCountry(u);
  const place = formatPlace(u.last_city, u.last_region);

  const runExport = async (kind: "json" | "html") => {
    setExporting(true);
    try {
      const journey = await loadJourney(u.id);
      const stamp = new Date().toISOString().slice(0, 10);
      if (kind === "json") {
        saveBlob(
          `zcrypt-user-${u.username}-${stamp}.json`,
          buildReportJson(data, journey),
          "application/json",
        );
      } else {
        saveBlob(
          `zcrypt-user-${u.username}-${stamp}.html`,
          buildReportHtml(data, journey, exportLabels(data)),
          "text/html",
        );
      }
      toast.success(tr("exported"), { detail: tr("exportedDetail", { count: journey.length }) });
    } catch (err) {
      toast.error(tr("exportFailed"), { detail: err instanceof Error ? err.message : undefined });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="space-y-5">
        {back}

        <section className="panel p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface-1)] text-lg font-semibold text-[var(--color-text-secondary)] ring-1 ring-[var(--color-border)]">
                {u.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--color-text)]">
                  {u.username}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--color-text-muted)]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{u.email}</span>
                  </span>
                  <span className="flex items-center gap-1.5 tabular-nums">
                    <Clock className="h-3.5 w-3.5" />
                    {t("joined", { date: formatDateShort(u.created_at) })}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                    {code ? <CountryLabel code={code} /> : tr("unknown")}
                    {place && <span className="truncate">· {place}</span>}
                  </span>
                </div>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <RoleBadge role={u.role} bordered />
                  <PlanBadge plan={u.plan || "free"} bordered />
                  {u.totp_enabled && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                      <Shield className="h-3 w-3" />
                      {t("twoFa")}
                    </span>
                  )}
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {u.email_verified ? t("verified") : t("unverified")}
                  </span>
                  {u.last_seen_at && (
                    <span className="text-xs text-[var(--color-text-muted)]">
                      · {t("lastSeen", { time: formatRelativeTime(u.last_seen_at) })}
                      {u.last_user_agent && ` · ${parseUserAgent(u.last_user_agent)}`}
                    </span>
                  )}
                  {u.signup_country && u.signup_country !== u.last_country && (
                    <span className="text-xs text-[var(--color-text-muted)]">
                      · {t("signedUpIn", { country: countryName(u.signup_country) })}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm" disabled={exporting}>
                    <Download className="h-3.5 w-3.5" />
                    {exporting ? tr("exporting") : tr("export")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => void runExport("html")}>
                    <FileText className="h-4 w-4" />
                    {tr("exportHtml")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void runExport("json")}>
                    <Code className="h-4 w-4" />
                    {tr("exportJson")}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <RowActionsMenu actions={actions.actionsFor(u)} label={t("actions")} />
            </div>
          </div>
        </section>

        <UserReport report={data} onChanged={report.refresh} />
        <UserJourney userId={u.id} />
      </div>
      {actions.dialog}
    </>
  );
}
