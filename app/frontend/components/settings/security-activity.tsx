"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { qk } from "@/lib/query-keys";
import { getUserActivity, type AuditEvent } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import { EVENT_ICONS } from "@/lib/audit-events";
import { parseUserAgent } from "@/lib/user-agent";
import { SkeletonRow } from "@/components/ui/skeletons";
import { Pagination } from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, Activity } from "@/lib/icons";

const PAGE_SIZE = 10;
const EMPTY_EVENTS: AuditEvent[] = [];

type Translate = ReturnType<typeof useTranslations>;

function eventLabel(type: string, t: Translate): string {
  const key = `events.${type}`;
  return t.has(key) ? t(key) : type.replace(/_/g, " ");
}

export function SecurityActivity() {
  const t = useTranslations("settings.securityActivity");
  const hasToken = useAuthStore((s) => !!s.accessToken);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: qk.securityActivity,
    queryFn: () => getUserActivity(useAuthStore.getState().accessToken ?? ""),
    enabled: hasToken,
  });
  const events: AuditEvent[] = query.data ?? EMPTY_EVENTS;
  const loading = query.isPending;

  const totalPages = Math.max(1, Math.ceil(events.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageEvents = events.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div>
      {loading ? (
        <div className="divide-y divide-[var(--color-border)]">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : query.isError ? (
        <div
          role="alert"
          className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center"
        >
          <Shield className="mx-auto mb-2 h-7 w-7 text-[var(--color-text-muted)]" />
          <p className="text-sm text-[var(--color-text-secondary)]">{t("loadFailed")}</p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="mt-3 text-xs font-medium text-[var(--color-text)] underline underline-offset-2"
          >
            {t("retry")}
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center">
          <Activity className="mx-auto mb-2 h-7 w-7 text-[var(--color-text-muted)]" />
          <p className="text-sm text-[var(--color-text-secondary)]">{t("empty")}</p>
        </div>
      ) : (
        <TooltipProvider delayDuration={300}>
          <div className="space-y-4">
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-[var(--color-border)] md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)] text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="px-4 py-3 text-left font-medium">{t("colEvent")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("colIp")}</th>
                    <th className="px-4 py-3 text-left font-medium">{t("colDevice")}</th>
                    <th className="px-4 py-3 text-right font-medium">{t("colTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pageEvents.map((event) => {
                    const Icon = EVENT_ICONS[event.event_type] ?? Shield;
                    const label = eventLabel(event.event_type, t);
                    return (
                      <tr
                        key={event.id}
                        className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-1)]"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-1)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]">
                              <Icon className="h-3.5 w-3.5" />
                            </div>
                            <span className="font-medium text-[var(--color-text)]">{label}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-secondary)]">
                          {event.ip}
                        </td>
                        <td className="px-4 py-3">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default text-xs text-[var(--color-text-secondary)]">
                                {parseUserAgent(event.user_agent)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[280px] break-all">
                              {event.user_agent || t("unknownDevice")}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="cursor-default text-xs tabular-nums text-[var(--color-text-muted)]">
                                {formatRelativeTime(event.created_at)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {formatDateTime(event.created_at, { seconds: true })}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <ul className="divide-y divide-[var(--color-border)] md:hidden">
              {pageEvents.map((event) => {
                const Icon = EVENT_ICONS[event.event_type] ?? Shield;
                const label = eventLabel(event.event_type, t);
                return (
                  <li key={event.id} className="flex items-center gap-3 py-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-1)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]">
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">
                        {label}
                      </p>
                      <p className="truncate text-xs text-[var(--color-text-muted)]">
                        {event.ip} · {parseUserAgent(event.user_agent)}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">
                      {formatRelativeTime(event.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>

            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={events.length}
              pageSize={PAGE_SIZE}
            />
          </div>
        </TooltipProvider>
      )}
    </div>
  );
}
