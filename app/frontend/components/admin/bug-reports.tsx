"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
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
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import { toast } from "@/store/toast";
import { AlertTriangle } from "@/lib/icons";
import { Badge } from "@/components/ui/badge";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const PAGE_SIZE = 20;

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
                <Field label={t("reporter")} value={report.email} />
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
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<BugReportStatus | "">("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, loading } = useAdminQuery(qk.adminBugReports(status, page * PAGE_SIZE), () =>
    adminListBugReports(status, PAGE_SIZE, page * PAGE_SIZE),
  );

  const reports = data?.reports ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const selected = reports.find((r) => r.id === selectedId) ?? null;

  const changeStatus = async (id: string, next: BugReportStatus) => {
    try {
      await adminUpdateBugReport(id, next);
      await queryClient.invalidateQueries({ queryKey: ["admin", "bug-reports"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("updateFailed"));
    }
  };

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--color-text-muted)]" />
          <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
            {t("title")}
          </h2>
          <span className="text-xs text-[var(--color-text-muted)] tabular-nums">({total})</span>
        </div>
        <div className="sm:w-44">
          <Select
            value={status || "all"}
            onValueChange={(v) => {
              setStatus(v === "all" ? "" : (v as BugReportStatus));
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
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title={t("emptyTitle")}
          description={status ? t("emptyFiltered") : t("emptyAll")}
        />
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {reports.map((r) => (
            <li key={r.id}>
              <button
                onClick={() => setSelectedId(r.id)}
                className="flex w-full items-start gap-3 px-5 py-3 text-left transition-colors hover:bg-[var(--color-surface-1)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 break-words text-sm text-[var(--color-text)]">
                    {r.description}
                  </p>
                  <p className="mt-1 truncate text-xs text-[var(--color-text-muted)]">
                    {r.username || r.email || t("signedOut")} · {r.platform || t("unknownLower")} ·{" "}
                    {r.app_version || t("unknownLower")} · {formatRelativeTime(r.created_at)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <StatusBadge status={r.status} />
                  <KindBadge kind={r.kind} />
                </div>
              </button>
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

      <ReportDrawer
        report={selected}
        onClose={() => setSelectedId(null)}
        onStatus={(id, next) => void changeStatus(id, next)}
      />
    </section>
  );
}
