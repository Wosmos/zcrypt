"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import { getUserActivity, type AuditEvent } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import { formatDateTime, formatRelativeTime } from "@/lib/utils";
import { EVENT_ICONS } from "@/lib/audit-events";
import { SkeletonRow } from "@/components/ui/skeletons";
import { Pagination } from "@/components/ui/pagination";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield, Activity } from "@/lib/icons";

const PAGE_SIZE = 10;
const EMPTY_EVENTS: AuditEvent[] = [];

const eventLabels: Record<string, string> = {
  login: "Signed in",
  login_failed: "Failed sign in attempt",
  register: "Account created",
  logout: "Signed out",
  oauth_login: "OAuth sign in",
  oauth_register: "OAuth sign up",
  oauth_link: "OAuth linked",
  oauth_unlink: "OAuth unlinked",
  magic_link_sent: "Magic link sent",
  magic_link_used: "Magic link sign in",
  "2fa_enable": "2FA enabled",
  "2fa_disable": "2FA disabled",
  email_verify: "Email verified",
  password_reset_requested: "Password reset requested",
  password_reset: "Password reset",
  password_changed: "Password changed",
  password_change_failed: "Failed password change",
  "2fa_failed": "Failed 2FA attempt",
  "2fa_ratelimited": "2FA attempts rate limited",
  "2fa_replay": "2FA code reuse blocked",
  "2fa_backup_codes_regenerated": "2FA backup codes regenerated",
  oauth_link_rejected: "OAuth link rejected",
  login_decoy: "Decoy vault sign in",
  profile_update: "Profile updated",
  platform_connect: "Storage platform connected",
  platform_disconnect: "Storage platform disconnected",
  token_scope_change: "Access token scope changed",
  file_delete: "File deleted",
  file_restore: "File restored",
  file_purge: "File permanently deleted",
  file_purge_client: "File permanently deleted",
  file_rekey: "File re-encrypted",
  folder_delete: "Folder deleted",
  folder_password_set: "Folder password set",
  folder_password_remove: "Folder password removed",
  upload_init: "Upload started",
  upload_resume: "Upload resumed",
  upload_complete: "Upload completed",
  send_init: "Send started",
  send_complete: "Send completed",
  repo_register: "Repository registered",
  repo_deactivate: "Repository deactivated",
  bug_report: "Bug report submitted",
  review_submit: "Review submitted",
  user_feedback: "Feedback submitted",
};

/** Short "Browser · OS" summary for a table cell; the full string stays in a tooltip. */
function parseUserAgent(ua: string): string {
  if (!ua) return "Unknown";
  let browser = "Unknown";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/") && !ua.includes("Chrome")) browser = "Safari";
  else if (ua.includes("zcrypt")) browser = "zcrypt CLI";

  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Linux")) os = "Linux";

  return `${browser} · ${os}`;
}

export function SecurityActivity() {
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
          <p className="text-sm text-[var(--color-text-secondary)]">
            Could not load your security activity
          </p>
          <button
            type="button"
            onClick={() => query.refetch()}
            className="mt-3 text-xs font-medium text-[var(--color-text)] underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center">
          <Activity className="mx-auto mb-2 h-7 w-7 text-[var(--color-text-muted)]" />
          <p className="text-sm text-[var(--color-text-secondary)]">No activity yet</p>
        </div>
      ) : (
        <TooltipProvider delayDuration={300}>
          <div className="space-y-4">
            {/* Desktop table */}
            <div className="hidden overflow-x-auto rounded-xl border border-[var(--color-border)] md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)] text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                    <th className="px-4 py-3 text-left font-medium">Event</th>
                    <th className="px-4 py-3 text-left font-medium">IP address</th>
                    <th className="px-4 py-3 text-left font-medium">Device</th>
                    <th className="px-4 py-3 text-right font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {pageEvents.map((event) => {
                    const Icon = EVENT_ICONS[event.event_type] ?? Shield;
                    const label =
                      eventLabels[event.event_type] ?? event.event_type.replace(/_/g, " ");
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
                              {event.user_agent || "Unknown device"}
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
                const label = eventLabels[event.event_type] ?? event.event_type.replace(/_/g, " ");
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
