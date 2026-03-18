"use client";

import { useEffect, useState, useCallback } from "react";
import { adminGetAuditLog, type AdminAuditResponse } from "@/lib/api";
import { useOperationStatus } from "@/hooks/useOperationStatus";
import type { AuditEvent } from "@/lib/auth-api";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
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
  Monitor,
  Globe,
  Smartphone,
  Clock,
} from "@/lib/icons";

const PAGE_SIZE = 20;

const eventColors: Record<string, string> = {
  login: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  login_failed: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  register: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  logout: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  oauth_login: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  oauth_register: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  oauth_link: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
  oauth_unlink: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  magic_link_sent: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  magic_link_used: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  file_upload: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  file_download: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  file_delete: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  platform_connect: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
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

const eventLabels: Record<string, string> = {
  login: "User Login",
  login_failed: "Login Failed",
  register: "User Registered",
  logout: "User Logout",
  oauth_login: "OAuth Login",
  oauth_register: "OAuth Register",
  oauth_link: "OAuth Linked",
  oauth_unlink: "OAuth Unlinked",
  magic_link_sent: "Magic Link Sent",
  magic_link_used: "Magic Link Used",
  file_upload: "File Uploaded",
  file_download: "File Downloaded",
  file_delete: "File Deleted",
  platform_connect: "Platform Connected",
  platform_disconnect: "Platform Disconnected",
  "2fa_enable": "2FA Enabled",
  "2fa_disable": "2FA Disabled",
  admin_role_change: "Role Changed",
  admin_user_delete: "User Deleted",
  admin_plan_change: "Plan Changed",
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
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function formatFullTime(dateStr: string) {
  return new Date(dateStr).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Parse user agent into readable browser/OS/device info
function parseUserAgent(ua: string): { browser: string; os: string; device: string } {
  if (!ua) return { browser: "Unknown", os: "Unknown", device: "Unknown" };

  let browser = "Unknown";
  let os = "Unknown";
  let device = "Desktop";

  // Browser detection
  if (ua.includes("Firefox/")) {
    const m = ua.match(/Firefox\/([\d.]+)/);
    browser = `Firefox ${m?.[1]?.split(".")[0] ?? ""}`;
  } else if (ua.includes("Edg/")) {
    const m = ua.match(/Edg\/([\d.]+)/);
    browser = `Edge ${m?.[1]?.split(".")[0] ?? ""}`;
  } else if (ua.includes("Chrome/") && !ua.includes("Edg/")) {
    const m = ua.match(/Chrome\/([\d.]+)/);
    browser = `Chrome ${m?.[1]?.split(".")[0] ?? ""}`;
  } else if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    const m = ua.match(/Version\/([\d.]+)/);
    browser = `Safari ${m?.[1]?.split(".")[0] ?? ""}`;
  } else if (ua.includes("zcrypt-tui") || ua.includes("zcrypt-cli")) {
    browser = "zcrypt CLI";
  }

  // OS detection
  if (ua.includes("Windows NT 10")) os = "Windows";
  else if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Android")) { os = "Android"; device = "Mobile"; }
  else if (ua.includes("iPhone") || ua.includes("iPad")) { os = "iOS"; device = ua.includes("iPad") ? "Tablet" : "Mobile"; }
  else if (ua.includes("Linux")) os = "Linux";
  else if (ua.includes("zcrypt")) os = "CLI";

  // Device detection
  if (ua.includes("Mobile") || ua.includes("Android")) device = "Mobile";
  else if (ua.includes("Tablet") || ua.includes("iPad")) device = "Tablet";

  return { browser, os, device };
}

// Render human-readable metadata based on event type
function EventDetails({ event }: { event: AdminAuditResponse["events"][0] }) {
  const meta = event.metadata;
  if (!meta || Object.keys(meta).length === 0) return null;

  const details: { label: string; value: string; accent?: boolean }[] = [];

  switch (event.event_type) {
    case "login":
    case "login_failed":
      if (meta.email) details.push({ label: "Email", value: String(meta.email) });
      if (meta.method) details.push({ label: "Method", value: String(meta.method) });
      if (meta.reason) details.push({ label: "Reason", value: String(meta.reason).replace(/_/g, " "), accent: true });
      break;

    case "register":
      if (meta.email) details.push({ label: "Email", value: String(meta.email) });
      break;

    case "oauth_login":
    case "oauth_register":
    case "oauth_link":
    case "oauth_unlink":
      if (meta.provider) details.push({ label: "Provider", value: String(meta.provider) });
      if (meta.email) details.push({ label: "Email", value: String(meta.email) });
      break;

    case "magic_link_sent":
    case "magic_link_used":
      if (meta.email) details.push({ label: "Email", value: String(meta.email) });
      break;

    case "file_upload":
      if (meta.filename) details.push({ label: "File", value: String(meta.filename) });
      if (meta.file_size_bytes) details.push({ label: "Size", value: formatBytes(Number(meta.file_size_bytes)) });
      if (meta.compressed_size) details.push({ label: "Compressed", value: formatBytes(Number(meta.compressed_size)) });
      if (meta.encrypted_size) details.push({ label: "Encrypted", value: formatBytes(Number(meta.encrypted_size)) });
      if (meta.chunk_count) details.push({ label: "Chunks", value: String(meta.chunk_count) });
      break;

    case "file_download":
      if (meta.filename) details.push({ label: "File", value: String(meta.filename) });
      if (meta.file_id) details.push({ label: "File ID", value: String(meta.file_id).slice(0, 8) + "..." });
      break;

    case "file_delete":
      if (meta.filename) details.push({ label: "File", value: String(meta.filename) });
      if (meta.file_id) details.push({ label: "File ID", value: String(meta.file_id).slice(0, 8) + "..." });
      break;

    case "platform_connect":
    case "platform_disconnect":
      if (meta.platform) details.push({ label: "Platform", value: String(meta.platform) });
      if (meta.username) details.push({ label: "Account", value: `@${meta.username}` });
      if (meta.token_id) details.push({ label: "Token", value: String(meta.token_id).slice(0, 8) + "..." });
      if (meta.is_global !== undefined) details.push({ label: "Scope", value: meta.is_global ? "Global" : "Local" });
      break;

    case "admin_role_change":
      if (meta.target_user) details.push({ label: "Target User", value: String(meta.target_user).slice(0, 8) + "..." });
      if (meta.role) details.push({ label: "New Role", value: String(meta.role), accent: true });
      break;

    case "admin_user_delete":
      if (meta.target_user) details.push({ label: "Deleted User", value: String(meta.target_user).slice(0, 8) + "..." });
      break;

    case "admin_plan_change":
      if (meta.target_user) details.push({ label: "Target User", value: String(meta.target_user).slice(0, 8) + "..." });
      if (meta.plan) details.push({ label: "New Plan", value: String(meta.plan), accent: true });
      break;

    default:
      // Fallback: show all metadata keys
      Object.entries(meta).forEach(([key, value]) => {
        details.push({ label: key.replace(/_/g, " "), value: String(value) });
      });
  }

  if (details.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {details.map((d) => (
        <div key={d.label} className="text-xs">
          <span className="text-[var(--color-text-muted)]">{d.label}: </span>
          <span className={cn("font-medium", d.accent ? "text-amber-500" : "text-[var(--color-text-secondary)]")}>
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
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
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--color-text-muted)]" />
          <h2 className="text-sm font-semibold">Audit Log</h2>
          <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
            ({total} events)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused(!paused)}
            className={cn(
              "flex items-center gap-1 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors",
              paused
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400"
            )}
          >
            {paused ? <Play className="h-3 w-3" /> : <Pause className="h-3 w-3" />}
            {paused ? "Resume" : "Live"}
          </button>
          <div className="relative flex-1 sm:flex-initial">
            <select
              value={eventTypeFilter}
              onChange={(e) => { setEventTypeFilter(e.target.value); setPage(1); }}
              className="appearance-none w-full sm:w-auto text-xs bg-[var(--color-surface-1)] border border-[var(--color-border)] rounded-lg px-2.5 py-1.5 pr-7 text-[var(--color-text-secondary)] cursor-pointer"
            >
              <option value="">All events</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>{eventLabels[t] || t.replace(/_/g, " ")}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-[var(--color-text-muted)] pointer-events-none" />
          </div>
        </div>
      </div>

      <div className="divide-y divide-[var(--color-border)]">
        {loading && events.length === 0 ? (
          <div className="divide-y divide-[var(--color-border)]">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3">
                <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
                <div className="flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                  <Skeleton className="h-2.5 w-48" />
                </div>
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">No events found</div>
        ) : (
          events.map((event) => {
            const Icon = eventIcons[event.event_type] ?? Shield;
            const color = eventColors[event.event_type] ?? "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
            const label = eventLabels[event.event_type] ?? event.event_type.replace(/_/g, " ");
            const isExpanded = expandedId === event.id;
            const ua = parseUserAgent(event.user_agent);
            const DeviceIcon = ua.device === "Mobile" ? Smartphone : Monitor;

            return (
              <button
                key={event.id}
                onClick={() => setExpandedId(isExpanded ? null : event.id)}
                className="w-full text-left px-5 py-3 hover:bg-[var(--color-surface-1)] transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg border flex-shrink-0 mt-0.5", color)}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {/* Row 1: event badge + IP + time */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap", color)}>
                        {label}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)] truncate hidden sm:inline">
                        {event.ip}
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)] tabular-nums ml-auto flex-shrink-0 hidden sm:inline">
                        {formatRelativeTime(event.created_at)}
                      </span>
                    </div>

                    {/* Row 2 (always visible): quick context — device + browser on mobile, metadata summary */}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1 text-[10px] text-[var(--color-text-muted)]">
                        <DeviceIcon className="h-3 w-3" />
                        {ua.browser} / {ua.os}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] inline-flex items-center gap-1 sm:hidden">
                        <Globe className="h-3 w-3" />
                        {event.ip}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums sm:hidden ml-auto inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(event.created_at)}
                      </span>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-3 space-y-3 animate-fade-in">
                        {/* Metadata details */}
                        <EventDetails event={event} />

                        {/* System info grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 rounded-lg bg-[var(--color-surface-1)]">
                          {event.user_id && (
                            <div className="text-xs">
                              <span className="text-[var(--color-text-muted)]">User ID: </span>
                              <span className="font-mono text-[var(--color-text-secondary)]">{event.user_id.slice(0, 12)}...</span>
                            </div>
                          )}
                          <div className="text-xs">
                            <span className="text-[var(--color-text-muted)]">IP Address: </span>
                            <span className="font-mono text-[var(--color-text-secondary)]">{event.ip}</span>
                          </div>
                          <div className="text-xs">
                            <span className="text-[var(--color-text-muted)]">Browser: </span>
                            <span className="text-[var(--color-text-secondary)]">{ua.browser}</span>
                          </div>
                          <div className="text-xs">
                            <span className="text-[var(--color-text-muted)]">OS: </span>
                            <span className="text-[var(--color-text-secondary)]">{ua.os}</span>
                          </div>
                          <div className="text-xs">
                            <span className="text-[var(--color-text-muted)]">Device: </span>
                            <span className="text-[var(--color-text-secondary)]">{ua.device}</span>
                          </div>
                          <div className="text-xs">
                            <span className="text-[var(--color-text-muted)]">Time: </span>
                            <span className="text-[var(--color-text-secondary)]">{formatFullTime(event.created_at)}</span>
                          </div>
                        </div>

                        {/* Raw user agent */}
                        <div className="text-[10px] text-[var(--color-text-muted)] break-all leading-relaxed">
                          <span className="font-medium">UA:</span> {event.user_agent}
                        </div>
                      </div>
                    )}
                  </div>
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
