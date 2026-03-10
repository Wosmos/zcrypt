"use client";

import { useEffect, useState, useCallback } from "react";
import { adminGetAuditLog, type AdminAuditResponse } from "@/lib/api";
import { useOperationStatus } from "@/hooks/useOperationStatus";
import type { AuditEvent } from "@/lib/auth-api";
import { cn } from "@/lib/utils";
import { Pagination } from "@/components/ui/pagination";
import {
  Shield,
  LogIn,
  LogOut,
  UserPlus,
  Key,
  Link2,
  HardDrive,
  Upload,
  Download,
  Trash2,
  Settings,
  ChevronDown,
  Pause,
  Play,
  FileText,
} from "lucide-react";

const PAGE_SIZE = 20;

const eventColors: Record<string, string> = {
  login: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  login_failed: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  register: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  logout: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  oauth_login: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  oauth_register: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  oauth_link: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  oauth_unlink: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  magic_link_sent: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  magic_link_used: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  file_upload: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  file_download: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  file_delete: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  platform_connect: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  platform_disconnect: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  admin_role_change: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  admin_user_delete: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  admin_plan_change: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
};

const eventIcons: Record<string, typeof Shield> = {
  login: LogIn,
  login_failed: LogIn,
  register: UserPlus,
  logout: LogOut,
  oauth_login: LogIn,
  oauth_register: UserPlus,
  oauth_link: Link2,
  oauth_unlink: Link2,
  magic_link_sent: Key,
  magic_link_used: Key,
  file_upload: Upload,
  file_download: Download,
  file_delete: Trash2,
  platform_connect: HardDrive,
  platform_disconnect: HardDrive,
  "2fa_enable": Shield,
  "2fa_disable": Shield,
  admin_role_change: Settings,
  admin_user_delete: Trash2,
  admin_plan_change: Settings,
};

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function AuditLog() {
  const [events, setEvents] = useState<AdminAuditResponse["events"]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminGetAuditLog({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        event_type: eventTypeFilter || undefined,
      });
      setEvents(res.events);
      setTotal(res.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, eventTypeFilter]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  // Real-time SSE audit events (prepend to list if on page 1 and not paused)
  useOperationStatus(
    () => {},
    useCallback((event: AuditEvent) => {
      if (paused || page !== 1) return;
      if (eventTypeFilter && event.event_type !== eventTypeFilter) return;
      setEvents((prev) => [event, ...prev].slice(0, PAGE_SIZE));
      setTotal((t) => t + 1);
    }, [paused, page, eventTypeFilter])
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const eventTypes = [
    "login", "login_failed", "register", "logout",
    "oauth_login", "oauth_register", "oauth_link", "oauth_unlink",
    "magic_link_sent", "magic_link_used",
    "file_upload", "file_download", "file_delete",
    "platform_connect", "platform_disconnect",
    "2fa_enable", "2fa_disable",
    "admin_role_change", "admin_user_delete", "admin_plan_change",
  ];

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--color-text-muted)]" />
          <h2 className="text-sm font-semibold">Audit Log</h2>
          <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
            ({total} events)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused(!paused)}
            className={cn(
              "flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-lg transition-colors",
              paused
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            )}
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? "Resume" : "Live"}
          </button>
          <div className="relative">
            <select
              value={eventTypeFilter}
              onChange={(e) => { setEventTypeFilter(e.target.value); setPage(1); }}
              className="appearance-none text-[11px] bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 pr-7 text-[var(--color-text-secondary)] cursor-pointer"
            >
              <option value="">All events</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--color-text-muted)] pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {loading && events.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">Loading...</div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">No events found</div>
        ) : (
          events.map((event) => {
            const Icon = eventIcons[event.event_type] ?? Shield;
            const color = eventColors[event.event_type] ?? "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
            const isExpanded = expandedId === event.id;
            return (
              <button
                key={event.id}
                onClick={() => setExpandedId(isExpanded ? null : event.id)}
                className="w-full text-left px-5 py-3 hover:bg-[var(--color-surface-1)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg border flex-shrink-0", color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border", color)}>
                        {event.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="text-[11px] text-[var(--color-text-muted)] truncate">
                        {event.ip}
                      </span>
                    </div>
                    {isExpanded && (
                      <div className="mt-2 text-[11px] text-[var(--color-text-secondary)] space-y-1 animate-fade-in">
                        {event.user_id && <p>User: {event.user_id}</p>}
                        <p>IP: {event.ip}</p>
                        <p>UA: {event.user_agent}</p>
                        {Object.keys(event.metadata).length > 0 && (
                          <pre className="text-[10px] bg-[var(--color-surface-1)] rounded p-2 overflow-x-auto">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums flex-shrink-0">
                    {formatRelativeTime(event.created_at)}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="px-5 py-3 border-t border-[var(--color-border)]">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={total}
            pageSize={PAGE_SIZE}
          />
        </div>
      )}
    </section>
  );
}
