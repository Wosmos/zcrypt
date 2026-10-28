"use client";

import { useTranslations } from "next-intl";
import { useState, useCallback } from "react";
import Link from "next/link";
import { adminGetAuditLog, type AdminAuditResponse } from "@/lib/api";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { useAdminList } from "@/hooks/useAdminList";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { useOperationStatus } from "@/hooks/useOperationStatus";
import type { AuditEvent } from "@/lib/auth-api";
import { cn, formatBytes, formatDateTime, formatRelativeTime } from "@/lib/utils";
import { EVENT_ICONS, eventColorClass } from "@/lib/audit-events";
import { describeUserAgent } from "@/lib/user-agent";
import { IconButton } from "@/components/ui/icon-button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DataTable, TableFilter, TableSearch } from "@/components/admin/data-table";
import { CountryLabel } from "@/components/admin/location-cell";
import { useEventLabel } from "@/components/admin/user-journey";
import { Shield, Pause, Play, FileText, Monitor, Smartphone } from "@/lib/icons";

type AuditRow = AdminAuditResponse["events"][number];

// Render human-readable metadata based on event type
function EventDetails({ event }: { event: AuditRow }) {
  const t = useTranslations("admin.audit");
  const meta = event.metadata;
  if (!meta || Object.keys(meta).length === 0) return null;

  const details: { label: string; value: string; accent?: boolean }[] = [];

  switch (event.event_type) {
    case "login":
    case "login_failed":
      if (meta.email) details.push({ label: t("dEmail"), value: String(meta.email) });
      if (meta.method) details.push({ label: t("dMethod"), value: String(meta.method) });
      if (meta.reason)
        details.push({
          label: t("dReason"),
          value: String(meta.reason).replace(/_/g, " "),
          accent: true,
        });
      break;

    case "register":
      if (meta.email) details.push({ label: t("dEmail"), value: String(meta.email) });
      break;

    case "oauth_login":
    case "oauth_register":
    case "oauth_link":
    case "oauth_unlink":
      if (meta.provider) details.push({ label: t("dProvider"), value: String(meta.provider) });
      if (meta.email) details.push({ label: t("dEmail"), value: String(meta.email) });
      break;

    case "magic_link_sent":
    case "magic_link_used":
      if (meta.email) details.push({ label: t("dEmail"), value: String(meta.email) });
      break;

    case "file_upload":
      if (meta.filename) details.push({ label: t("dFile"), value: String(meta.filename) });
      if (meta.file_size_bytes)
        details.push({ label: t("dSize"), value: formatBytes(Number(meta.file_size_bytes)) });
      if (meta.compressed_size)
        details.push({ label: t("dCompressed"), value: formatBytes(Number(meta.compressed_size)) });
      if (meta.encrypted_size)
        details.push({ label: t("dEncrypted"), value: formatBytes(Number(meta.encrypted_size)) });
      if (meta.chunk_count) details.push({ label: t("dChunks"), value: String(meta.chunk_count) });
      break;

    case "file_download":
      if (meta.filename) details.push({ label: t("dFile"), value: String(meta.filename) });
      break;

    case "file_delete":
      if (meta.filename) details.push({ label: t("dFile"), value: String(meta.filename) });
      break;

    case "platform_connect":
    case "platform_disconnect":
      if (meta.platform) details.push({ label: t("dPlatform"), value: String(meta.platform) });
      if (meta.username) details.push({ label: t("dAccount"), value: `@${meta.username}` });
      if (meta.is_global !== undefined)
        details.push({
          label: t("dScope"),
          value: meta.is_global ? t("scopeGlobal") : t("scopeLocal"),
        });
      break;

    case "admin_role_change":
      if (event.target_username)
        details.push({ label: t("dTargetUser"), value: event.target_username });
      if (meta.role) details.push({ label: t("dNewRole"), value: String(meta.role), accent: true });
      break;

    case "admin_user_delete":
      details.push({
        label: t("dDeletedUser"),
        value: event.target_username || t("deletedAccount"),
      });
      break;

    case "admin_plan_change":
      if (event.target_username)
        details.push({ label: t("dTargetUser"), value: event.target_username });
      if (meta.plan) details.push({ label: t("dNewPlan"), value: String(meta.plan), accent: true });
      break;

    default:
      Object.entries(meta).forEach(([key, value]) => {
        if (HIDDEN_META.has(key)) return;
        details.push({
          label: key.replace(/_/g, " "),
          value: typeof value === "object" ? JSON.stringify(value) : String(value),
        });
      });
  }

  if (details.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {details.map((d) => (
        <div key={d.label} className="text-xs">
          <span className="text-[var(--color-text-muted)]">{d.label}: </span>
          <span
            className={cn(
              "font-medium",
              d.accent ? "text-amber-500" : "text-[var(--color-text-secondary)]",
            )}
          >
            {d.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// Keys that only carry ids or are shown elsewhere in the drawer.
const HIDDEN_META = new Set([
  "target_user",
  "token_id",
  "session_id",
  "file_id",
  "country",
  "region",
  "city",
  "who",
]);

const EVENT_TYPES = [
  "login",
  "login_failed",
  "register",
  "logout",
  "oauth_login",
  "oauth_register",
  "oauth_link",
  "oauth_unlink",
  "magic_link_sent",
  "magic_link_used",
  "upload_complete",
  "file_delete",
  "platform_connect",
  "platform_disconnect",
  "2fa_enable",
  "2fa_disable",
  "password_changed",
  "session_revoke",
  "admin_role_change",
  "admin_user_delete",
  "admin_plan_change",
  "admin_quota_change",
  "admin_session_revoke",
];

function AuditDrawer({ event, onClose }: { event: AuditRow | null; onClose: () => void }) {
  const t = useTranslations("admin.audit");
  const label = useEventLabel();
  const ua = event ? describeUserAgent(event.user_agent) : null;
  const country = event ? String(event.metadata?.country ?? "") : "";
  return (
    <Sheet open={!!event} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        {event && ua && (
          <>
            <SheetHeader>
              <SheetTitle>{label(event.event_type)}</SheetTitle>
              <SheetDescription>
                {formatDateTime(event.created_at, { seconds: true })}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-5 space-y-5">
              <EventDetails event={event} />
              <dl className="grid grid-cols-2 gap-3 rounded-xl bg-[var(--color-surface-1)] p-4 text-xs">
                <div className="col-span-2">
                  <dt className="text-[var(--color-text-muted)]">{t("user")}</dt>
                  <dd className="mt-0.5 font-medium text-[var(--color-text-secondary)]">
                    {event.user_id && event.username ? (
                      <Link
                        href={`/admin/users/${event.user_id}`}
                        className="underline-offset-2 hover:underline"
                      >
                        {event.username}
                      </Link>
                    ) : (
                      t("noUser")
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-muted)]">{t("location")}</dt>
                  <dd className="mt-0.5 font-medium text-[var(--color-text-secondary)]">
                    {country ? <CountryLabel code={country} /> : t("unknown")}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-muted)]">{t("ipAddress")}</dt>
                  <dd className="mt-0.5 font-mono text-[var(--color-text-secondary)]">
                    {event.ip || t("unknown")}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-muted)]">{t("browser")}</dt>
                  <dd className="mt-0.5 text-[var(--color-text-secondary)]">{ua.browser}</dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-muted)]">{t("os")}</dt>
                  <dd className="mt-0.5 text-[var(--color-text-secondary)]">{ua.os}</dd>
                </div>
              </dl>
              {event.user_agent && (
                <p className="break-all text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                  <span className="font-medium">{t("ua")}:</span> {event.user_agent}
                </p>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

export function AuditLog() {
  const t = useTranslations("admin.audit");
  const label = useEventLabel();
  const list = useAdminList("audit", { sort: "created_at" });
  const [paused, setPaused] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const key = qk.adminList("audit", list.params);
  const page = useAdminQuery(key, () => adminGetAuditLog(list.params));
  const events = page.data?.events ?? [];
  const live = !paused && list.page === 1 && list.order === "desc" && !list.q;
  const eventFilter = list.filters.event_type ?? "";

  useOperationStatus(
    () => {},
    useCallback(
      (event: AuditEvent) => {
        if (!live) return;
        if (eventFilter && event.event_type !== eventFilter) return;
        queryClient.setQueryData<AdminAuditResponse>(key, (prev) =>
          prev && prev.events.every((e) => e.id !== event.id)
            ? {
                ...prev,
                events: [event, ...prev.events].slice(0, list.pageSize),
                total: prev.total + 1,
              }
            : prev,
        );
      },
      [live, eventFilter, key, list.pageSize],
    ),
  );

  const opened = events.find((e) => e.id === openId) ?? null;

  return (
    <>
      <DataTable<AuditRow>
        label={t("title")}
        title={
          <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--color-text)]">
            <FileText className="h-4 w-4 text-[var(--color-text-muted)]" />
            {t("title")}
            <span className="text-xs font-normal tabular-nums text-[var(--color-text-muted)]">
              {t("eventCount", { count: page.data?.total ?? 0 })}
            </span>
          </h2>
        }
        toolbar={
          <>
            <TableSearch list={list} placeholder={t("search")} />
            <TableFilter
              list={list}
              name="event_type"
              label={t("filterType")}
              options={EVENT_TYPES.map((type) => ({ value: type, label: label(type) }))}
            />
            <IconButton
              icon={paused ? Play : Pause}
              label={paused ? t("resume") : t("pause")}
              variant="secondary"
              onClick={() => setPaused(!paused)}
              className={cn(
                paused
                  ? "text-amber-600 dark:text-amber-400"
                  : live && "text-[var(--color-accent)]",
              )}
            />
          </>
        }
        rows={events}
        rowKey={(e) => e.id}
        list={list}
        total={page.data?.total ?? 0}
        loading={page.loading}
        fetching={page.fetching}
        error={page.error}
        onRetry={page.refresh}
        empty={{
          icon: <FileText className="h-7 w-7 text-[var(--color-text-muted)]" />,
          title: t("emptyTitle"),
          description: t("emptyAll"),
        }}
        onRowOpen={(e) => setOpenId(e.id)}
        columns={[
          {
            id: "event",
            header: t("colEvent"),
            cell: (e) => {
              const Icon = EVENT_ICONS[e.event_type] ?? Shield;
              return (
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border",
                      eventColorClass(e.event_type, { border: true }),
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="truncate text-sm font-medium text-[var(--color-text)]">
                    {label(e.event_type)}
                  </span>
                </span>
              );
            },
          },
          {
            id: "user",
            header: t("user"),
            cell: (e) =>
              e.user_id && e.username ? (
                <Link
                  href={`/admin/users/${e.user_id}`}
                  className="truncate text-sm text-[var(--color-text-secondary)] underline-offset-2 hover:text-[var(--color-accent)] hover:underline"
                >
                  {e.username}
                </Link>
              ) : (
                <span className="text-sm text-[var(--color-text-muted)]">{t("noUser")}</span>
              ),
          },
          {
            id: "where",
            header: t("location"),
            hideBelow: "lg",
            cell: (e) => {
              const country = String(e.metadata?.country ?? "");
              return (
                <span className="flex min-w-0 flex-col text-xs">
                  {country ? <CountryLabel code={country} /> : null}
                  <span className="font-mono text-[var(--color-text-muted)]">{e.ip}</span>
                </span>
              );
            },
          },
          {
            id: "device",
            header: t("device"),
            hideBelow: "xl",
            cell: (e) => {
              const ua = describeUserAgent(e.user_agent);
              const DeviceIcon = ua.kind === "phone" ? Smartphone : Monitor;
              return (
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)]">
                  <DeviceIcon className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
                  {ua.browser} · {ua.os}
                </span>
              );
            },
          },
          {
            id: "time",
            header: t("time"),
            sortKey: "created_at",
            align: "end",
            cell: (e) => (
              <time
                dateTime={e.created_at}
                title={formatDateTime(e.created_at, { seconds: true })}
                className="whitespace-nowrap text-xs tabular-nums text-[var(--color-text-muted)]"
              >
                {formatRelativeTime(e.created_at)}
              </time>
            ),
          },
        ]}
      />
      <AuditDrawer event={opened} onClose={() => setOpenId(null)} />
    </>
  );
}
