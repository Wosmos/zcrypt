"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  adminGetBugReportScreenshot,
  adminListBugReports,
  adminUpdateBugReport,
  type AdminBugReport,
  type BugReportStatus,
  type FeedbackKind,
} from "@/lib/api";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { useAdminList } from "@/hooks/useAdminList";
import { qk } from "@/lib/query-keys";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import { AlertTriangle, Eye, User } from "@/lib/icons";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  BulkBar,
  DataTable,
  TableFilter,
  TableSearch,
  TableTitle,
} from "@/components/admin/data-table";
import { useBulkStatus } from "@/components/admin/status-bulk";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const STATUSES: { value: BugReportStatus; key: string }[] = [
  { value: "open", key: "statusOpen" },
  { value: "triaged", key: "statusTriaged" },
  { value: "fixed", key: "statusFixed" },
  { value: "wontfix", key: "statusWontfix" },
];

const STATUS_VARIANT = {
  open: "amber",
  triaged: "blue",
  fixed: "accent",
  wontfix: "muted",
} as const;

function StatusBadge({ status }: { status: BugReportStatus }) {
  const t = useTranslations("admin.bugs");
  const key = STATUSES.find((s) => s.value === status)?.key;
  return <Badge variant={STATUS_VARIANT[status] ?? "muted"}>{key ? t(key) : status}</Badge>;
}

const KIND_KEYS: Record<FeedbackKind, string> = {
  bug: "kindBug",
  idea: "kindIdea",
  left: "kindLeft",
  other: "kindOther",
};

function KindBadge({ kind }: { kind: FeedbackKind }) {
  const t = useTranslations("admin.bugs");
  return <Badge variant="muted">{KIND_KEYS[kind] ? t(KIND_KEYS[kind]) : kind}</Badge>;
}

function Screenshot({ id }: { id: string }) {
  const t = useTranslations("admin.bugs");
  const { data, isError } = useQuery({
    queryKey: ["admin", "bug-report-screenshot", id],
    queryFn: () => adminGetBugReportScreenshot(id),
    staleTime: Infinity,
  });
  const url = useMemo(() => (data ? URL.createObjectURL(data) : null), [data]);

  useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  if (isError) return <p className="text-xs text-red-500">{t("screenshotError")}</p>;
  if (!url) return <div className="h-40 animate-pulse rounded-xl bg-[var(--color-surface-1)]" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={t("screenshotAlt")}
        className="max-h-96 w-full rounded-xl border border-[var(--color-border)] object-contain"
      />
    </a>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  const t = useTranslations("admin.bugs");
  return (
    <div className="text-xs">
      <dt className="text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-[var(--color-text-secondary)]">
        {value || t("unknown")}
      </dd>
    </div>
  );
}

function ReportDrawer({
  report,
  onClose,
  onStatus,
}: {
  report: AdminBugReport | null;
  onClose: () => void;
  onStatus: (id: string, status: BugReportStatus) => void;
}) {
  const t = useTranslations("admin.bugs");
  return (
    <Sheet open={!!report} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {report && (
          <>
            <SheetHeader>
              <SheetTitle>{t("drawerTitle")}</SheetTitle>
              <SheetDescription>
                {report.username || report.email || t("signedOutUser")} ·{" "}
                {formatDateTime(report.created_at)}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-text-muted)]">{t("status")}</span>
                <Select
                  value={report.status}
                  onValueChange={(v) => onStatus(report.id, v as BugReportStatus)}
                >
                  <SelectTrigger className="h-9 w-40 text-xs" aria-label={t("reportStatus")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {t(s.key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[var(--color-text)]">
                {report.description}
              </p>

              {report.has_screenshot && <Screenshot id={report.id} />}

              <dl className="grid grid-cols-2 gap-3 border-t border-[var(--color-border)] pt-4">
                <Field label={t("kind")} value={t(KIND_KEYS[report.kind] ?? "kindBug")} />
                <div className="text-xs">
                  <dt className="text-[var(--color-text-muted)]">{t("reporter")}</dt>
                  <dd className="mt-0.5 break-words font-medium text-[var(--color-text-secondary)]">
                    {report.user_id ? (
                      <Link
                        href={`/admin/users/${report.user_id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {report.username || report.email}
                      </Link>
                    ) : (
                      t("signedOutUser")
                    )}
                  </dd>
                </div>
                {report.contact_email && (
                  <div className="col-span-2 text-xs">
                    <dt className="text-[var(--color-text-muted)]">{t("contactEmail")}</dt>
                    <dd className="mt-0.5 break-words font-medium text-[var(--color-text-secondary)]">
                      <a href={`mailto:${report.contact_email}`} className="underline">
                        {report.contact_email}
                      </a>
                    </dd>
                  </div>
                )}
                <Field label={t("appVersion")} value={report.app_version} />
                <Field label={t("platform")} value={report.platform} />
                <Field label={t("route")} value={report.route} />
                <div className="col-span-2">
                  <Field label={t("userAgent")} value={report.user_agent} />
                </div>
              </dl>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function BugReports() {
  const t = useTranslations("admin.bugs");
  const router = useRouter();
  const list = useAdminList("bug-reports", { sort: "created_at" });
  const status = (list.filters.status ?? "") as BugReportStatus | "";
  const page = useAdminQuery(qk.adminList("bug-reports", list.params), () =>
    adminListBugReports(status, list.params),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const bulk = useBulkStatus<BugReportStatus>(adminUpdateBugReport, [
    "admin",
    "list",
    "bug-reports",
  ]);

  const reports = page.data?.reports ?? [];
  const total = page.data?.total ?? 0;
  const selected = reports.find((r) => r.id === selectedId) ?? null;
  const live = reports.filter((r) => checked.has(r.id)).map((r) => r.id);
  const statusLabel = (s: BugReportStatus) =>
    t(STATUSES.find((x) => x.value === s)?.key ?? "statusOpen");

  const apply = async (ids: string[], next: BugReportStatus) => {
    const failed = await bulk.run(ids, next, statusLabel(next));
    setChecked(new Set(failed));
  };

  return (
    <>
      <DataTable<AdminBugReport>
        label={t("title")}
        title={<TableTitle icon={AlertTriangle} title={t("title")} count={total} />}
        toolbar={
          <>
            <TableSearch list={list} placeholder={t("search")} />
            <TableFilter
              list={list}
              name="status"
              label={t("filterStatus")}
              options={STATUSES.map((s) => ({ value: s.value, label: t(s.key) }))}
            />
          </>
        }
        rows={reports}
        rowKey={(r) => r.id}
        list={list}
        total={total}
        loading={page.loading}
        fetching={page.fetching}
        error={page.error}
        onRetry={page.refresh}
        empty={{
          icon: <AlertTriangle className="h-7 w-7 text-[var(--color-text-muted)]" />,
          title: t("emptyTitle"),
          description: t("emptyAll"),
        }}
        onRowOpen={(r) => setSelectedId(r.id)}
        selection={{ selected: checked, onChange: setChecked }}
        columns={[
          {
            id: "report",
            header: t("colReport"),
            className: "min-w-[16rem]",
            cell: (r) => (
              <span className="block min-w-0">
                <span className="line-clamp-2 break-words text-sm text-[var(--color-text)]">
                  {r.description}
                </span>
                <span className="mt-0.5 block truncate text-xs text-[var(--color-text-muted)]">
                  {r.username || r.email || t("signedOut")}
                </span>
              </span>
            ),
          },
          {
            id: "status",
            header: t("status"),
            cell: (r) => (
              <span className="flex flex-wrap gap-1">
                <StatusBadge status={r.status} />
                <KindBadge kind={r.kind} />
              </span>
            ),
          },
          {
            id: "app",
            header: t("appVersion"),
            hideBelow: "lg",
            cell: (r) => (
              <span className="text-xs text-[var(--color-text-secondary)]">
                {r.platform || t("unknownLower")} · {r.app_version || t("unknownLower")}
              </span>
            ),
          },
          {
            id: "created",
            header: t("colFiled"),
            sortKey: "created_at",
            align: "end",
            cell: (r) => (
              <span className="whitespace-nowrap text-xs tabular-nums text-[var(--color-text-muted)]">
                {formatRelativeTime(r.created_at)}
              </span>
            ),
          },
        ]}
        rowActions={(r) => [
          { label: t("view"), icon: Eye, onSelect: () => setSelectedId(r.id) },
          ...STATUSES.filter((s) => s.value !== r.status).map((s, i) => ({
            label: t("markAs", { status: t(s.key) }),
            separatorBefore: i === 0,
            onSelect: () => void apply([r.id], s.value),
          })),
          ...(r.user_id
            ? [
                {
                  label: t("openUser"),
                  icon: User,
                  separatorBefore: true,
                  onSelect: () => router.push(`/admin/users/${r.user_id}`),
                },
              ]
            : []),
        ]}
      />

      <BulkBar count={live.length} onClear={() => setChecked(new Set())}>
        {STATUSES.map((s) => (
          <Button
            key={s.value}
            variant="ghost"
            size="sm"
            disabled={bulk.busy}
            onClick={() => void apply(live, s.value)}
          >
            {t("markAs", { status: t(s.key) })}
          </Button>
        ))}
      </BulkBar>

      <ReportDrawer
        report={selected}
        onClose={() => setSelectedId(null)}
        onStatus={(id, next) => void apply([id], next)}
      />
    </>
  );
}
