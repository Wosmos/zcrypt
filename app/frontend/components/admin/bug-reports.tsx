"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  adminGetBugReportScreenshot,
  adminListBugReports,
  adminUpdateBugReport,
  type AdminBugReport,
  type BugReportStatus,
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

const STATUSES: { value: BugReportStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "triaged", label: "Triaged" },
  { value: "fixed", label: "Fixed" },
  { value: "wontfix", label: "Won't fix" },
];

const STATUS_VARIANT = {
  open: "amber",
  triaged: "blue",
  fixed: "accent",
  wontfix: "muted",
} as const;

function StatusBadge({ status }: { status: BugReportStatus }) {
  const label = STATUSES.find((s) => s.value === status)?.label ?? status;
  return <Badge variant={STATUS_VARIANT[status] ?? "muted"}>{label}</Badge>;
}

function Screenshot({ id }: { id: string }) {
  const { data, isError } = useQuery({
    queryKey: ["admin", "bug-report-screenshot", id],
    queryFn: () => adminGetBugReportScreenshot(id),
    staleTime: Infinity,
  });
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    const objectUrl = URL.createObjectURL(data);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [data]);

  if (isError) return <p className="text-xs text-red-500">Could not load the screenshot.</p>;
  if (!url) return <div className="h-40 animate-pulse rounded-xl bg-[var(--color-surface-1)]" />;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="Screenshot attached to the report"
        className="max-h-96 w-full rounded-xl border border-[var(--color-border)] object-contain"
      />
    </a>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-xs">
      <dt className="text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-0.5 break-words font-medium text-[var(--color-text-secondary)]">
        {value || "Unknown"}
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
  return (
    <Sheet open={!!report} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        {report && (
          <>
            <SheetHeader>
              <SheetTitle>Bug report</SheetTitle>
              <SheetDescription>
                {report.username || report.email || "Signed-out user"} ·{" "}
                {formatDateTime(report.created_at)}
              </SheetDescription>
            </SheetHeader>

            <div className="mt-5 space-y-5">
              <div className="flex items-center gap-3">
                <span className="text-xs text-[var(--color-text-muted)]">Status</span>
                <Select
                  value={report.status}
                  onValueChange={(v) => onStatus(report.id, v as BugReportStatus)}
                >
                  <SelectTrigger className="h-9 w-40 text-xs" aria-label="Report status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
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
                <Field label="Reporter" value={report.email} />
                <Field label="App version" value={report.app_version} />
                <Field label="Platform" value={report.platform} />
                <Field label="Route" value={report.route} />
                <div className="col-span-2">
                  <Field label="User agent" value={report.user_agent} />
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
      toast.error(err instanceof Error ? err.message : "Could not update the report");
    }
  };

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-[var(--color-text-muted)]" />
          <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
            Bug reports
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
            <SelectTrigger className="h-9 text-xs" aria-label="Filter by status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
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
          title="No bug reports"
          description={
            status ? "No reports match this status." : "Nothing has been reported from the app yet."
          }
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
                    {r.username || r.email || "Signed out"} · {r.platform || "unknown"} ·{" "}
                    {r.app_version || "unknown"} · {formatRelativeTime(r.created_at)}
                  </p>
                </div>
                <StatusBadge status={r.status} />
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
