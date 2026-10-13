"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  adminGetUser,
  adminSetUserRole,
  adminDeleteUser,
  adminSetUserQuota,
  adminSetUserPlan,
  adminGetPlans,
} from "@/lib/api";
import { formatBytes, cn, bytesToGb, usagePercent, formatRelativeTime } from "@/lib/utils";
import { quotaModeFor, parseQuotaInput, formatQuotaDisplay, type QuotaMode } from "@/lib/quota";
import { EVENT_ICONS } from "@/lib/audit-events";
import { toast } from "@/store/toast";
import { Role } from "@/types";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { ReauthFields, reauthReady, useUserActionConfirm } from "@/components/admin/reauth-fields";
import { NotifyFields } from "@/components/admin/notify-fields";
import { QuotaFields } from "@/components/admin/quota-fields";
import { UserDetailSkeleton } from "@/components/admin/skeletons";
import { RoleBadge, PlanBadge } from "@/components/admin/badges";
import { LoadErrorPanel } from "@/components/admin/load-error-panel";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { qk } from "@/lib/query-keys";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Shield, Mail, Clock, User, Trash2, FileText } from "@/lib/icons";

const eventColors: Record<string, string> = {
  login: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  login_failed: "bg-red-500/10 text-red-600 dark:text-red-400",
  register: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  logout: "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  file_upload: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  file_download: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  file_delete: "bg-red-500/10 text-red-600 dark:text-red-400",
  platform_connect: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
  platform_disconnect: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  admin_role_change: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  admin_user_delete: "bg-red-500/10 text-red-600 dark:text-red-400",
  admin_plan_change: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function AdminUserDetailContent() {
  const t = useTranslations("admin.userDetail");
  const tr = useTranslations("admin.userTable");
  const tRoles = useTranslations("admin.roles");
  const ta = useTranslations("admin.audit");
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const {
    confirmAction,
    setConfirmAction,
    reauth,
    setReauth,
    notify,
    setNotify,
    needsReauth,
    closeConfirm,
  } = useUserActionConfirm<{
    type: "delete" | "role" | "plan" | "quota";
    detail: string;
    newValue?: string;
    quotaBytes?: number | null;
  }>();

  const [editingQuota, setEditingQuota] = useState(false);
  const [quotaMode, setQuotaMode] = useState<QuotaMode>("default");
  const [quotaInput, setQuotaInput] = useState("");

  const {
    user: currentUser,
    data: detail,
    loading,
    error,
    refresh: fetchUser,
  } = useAdminQuery(
    qk.adminUser(id),
    async () => {
      const [res, plans] = await Promise.all([adminGetUser(id), adminGetPlans()]);
      return { res, planConfigs: plans.plans };
    },
    // Never show another user's details while this one loads.
    { keepPrevious: false },
  );
  const data = detail?.res ?? null;
  const planConfigs = detail?.planConfigs ?? [];

  if (!currentUser || currentUser.role !== Role.Admin) return null;
  if (loading) return <UserDetailSkeleton />;

  if (error || !data) {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 rounded-md text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Link>
        <LoadErrorPanel
          icon={<User className="h-7 w-7 text-[var(--color-text-muted)]" />}
          title={t("errorTitle")}
          description={t("errorDesc")}
          onRetry={fetchUser}
        />
      </div>
    );
  }

  const u = data.user;
  const isSelf = u.id === currentUser.id;
  const storagePercent = usagePercent(data.used_bytes, data.quota_bytes);
  const events = data.events ?? [];
  const userPlanConfig = planConfigs.find((p) => p.id === (u.plan || "free"));

  const handleRoleToggle = () => {
    const newRole = u.role === Role.Admin ? Role.User : Role.Admin;
    setConfirmAction({
      type: "role",
      detail:
        u.role === Role.Admin
          ? t("roleDemoteDetail", { username: u.username })
          : t("rolePromoteDetail", { username: u.username }),
      newValue: newRole,
    });
  };

  const handleDelete = () => {
    setConfirmAction({
      type: "delete",
      detail: tr("deleteDetail", { username: u.username }),
    });
  };

  const handlePlanChange = (newPlan: string) => {
    const targetConfig = planConfigs.find((p) => p.id === newPlan);
    const label = targetConfig?.name || newPlan;
    setConfirmAction({
      type: "plan",
      detail: targetConfig
        ? t("planDetailLimits", {
            username: u.username,
            plan: label,
            storage: targetConfig.storage_display,
            fileSize: targetConfig.max_file_display,
            concurrent: t("parallel", { count: targetConfig.max_concurrent_uploads }),
          })
        : t("planDetail", { username: u.username, plan: label }),
      newValue: newPlan,
    });
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction.type === "delete") {
        await adminDeleteUser(u.id, reauth, notify);
        toast.success(tr("userDeleted"));
        router.push("/admin/users");
        return;
      } else if (confirmAction.type === "role") {
        await adminSetUserRole(u.id, confirmAction.newValue!, reauth, notify);
        toast.success(
          tr("roleUpdated", {
            role: tRoles(confirmAction.newValue === "admin" ? "admin" : "user"),
          }),
        );
      } else if (confirmAction.type === "plan") {
        await adminSetUserPlan(u.id, confirmAction.newValue!, notify);
        toast.success(tr("planUpdated", { plan: confirmAction.newValue ?? "" }));
      } else {
        await adminSetUserQuota(u.id, confirmAction.quotaBytes ?? null, notify);
        toast.success(tr("quotaUpdated"));
        setEditingQuota(false);
      }
      closeConfirm();
      void fetchUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("actionFailed"));
    } finally {
      setBusy(false);
    }
  };

  const startEditQuota = () => {
    setEditingQuota(true);
    const mode = quotaModeFor(u.storage_quota);
    setQuotaMode(mode);
    setQuotaInput(mode === "custom" ? bytesToGb(u.storage_quota!).toString() : "");
  };

  const saveQuota = () => {
    const parsed = parseQuotaInput(quotaMode, quotaInput);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    setConfirmAction({
      type: "quota",
      detail: tr("quotaConfirmDetail", { username: u.username }),
      quotaBytes: parsed.bytes,
    });
  };

  const getConfirmModalProps = () => {
    if (!confirmAction) return null;
    switch (confirmAction.type) {
      case "delete":
        return {
          title: tr("deleteUser"),
          confirmLabel: tr("deleteUser"),
          variant: "danger" as const,
        };
      case "role":
        return {
          title: confirmAction.newValue === "admin" ? tr("promoteTitle") : tr("demoteTitle"),
          confirmLabel: confirmAction.newValue === "admin" ? tr("promote") : tr("demote"),
          variant: "warning" as const,
        };
      case "quota":
        return {
          title: tr("quotaConfirmTitle"),
          confirmLabel: tr("saveQuota"),
          variant: "warning" as const,
        };
      case "plan": {
        const targetConfig = planConfigs.find((p) => p.id === confirmAction.newValue);
        return {
          title: tr("changeTitle", { plan: targetConfig?.name || confirmAction.newValue || "" }),
          confirmLabel: tr("changePlan"),
          variant: "warning" as const,
        };
      }
    }
  };

  const modalProps = getConfirmModalProps();
  const sortedPlans = [...planConfigs].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <div className="space-y-6">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 rounded-md text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("back")}
        </Link>

        {/* User header */}
        <section className="panel p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] ring-1 ring-[var(--color-border)]">
                <User className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--color-text)]">
                  {u.username}
                </h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-text-muted)]">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {u.email}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <Clock className="h-3.5 w-3.5" />
                    {t("joined", { date: new Date(u.created_at).toLocaleDateString() })}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <RoleBadge role={u.role} bordered />
                  <PlanBadge plan={u.plan || "free"} bordered />
                  {u.totp_enabled && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                      <Shield className="h-3 w-3" />
                      {t("twoFa")}
                    </span>
                  )}
                  {u.email_verified && (
                    <span className="text-xs text-green-600 dark:text-green-400">
                      {t("verified")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {!isSelf && (
              <div className="flex flex-shrink-0 items-center gap-2">
                <Select value={u.plan || "free"} onValueChange={handlePlanChange} disabled={busy}>
                  <SelectTrigger className="h-9 w-28 text-xs" aria-label={t("changePlan")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedPlans.length > 0
                      ? sortedPlans.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))
                      : ["free", "plus", "pro", "team"].map((p) => (
                          <SelectItem key={p} value={p}>
                            {p.charAt(0).toUpperCase() + p.slice(1)}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={handleRoleToggle} disabled={busy}>
                  {u.role === Role.Admin ? tr("demote") : tr("promote")}
                </Button>
                <Button variant="danger" size="sm" onClick={handleDelete} disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("delete")}
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Plan details + Storage usage */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {userPlanConfig && (
            <section className="panel p-6">
              <Section title={t("planLimits", { plan: userPlanConfig.name })}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--color-border)] py-2">
                    <span className="text-xs text-[var(--color-text-muted)]">{t("storage")}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {userPlanConfig.storage_display}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--color-border)] py-2">
                    <span className="text-xs text-[var(--color-text-muted)]">{t("maxFile")}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {userPlanConfig.max_file_display}
                    </span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--color-border)] py-2">
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {t("concurrent")}
                    </span>
                    <span className="text-sm font-semibold tabular-nums">
                      {t("parallel", { count: userPlanConfig.max_concurrent_uploads })}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-[var(--color-text-muted)]">{t("price")}</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {userPlanConfig.monthly_price > 0
                        ? t("perMonth", { price: userPlanConfig.monthly_price })
                        : t("free")}
                    </span>
                  </div>
                </div>
              </Section>
            </section>
          )}

          <section className="panel p-6">
            <Section
              title={t("storageUsage")}
              actions={
                !editingQuota ? (
                  <Button variant="ghost" size="sm" onClick={startEditQuota}>
                    {t("overrideQuota")}
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <QuotaFields
                      mode={quotaMode}
                      input={quotaInput}
                      onModeChange={setQuotaMode}
                      onInputChange={setQuotaInput}
                    />
                    <Button variant="primary" size="sm" onClick={saveQuota} disabled={busy}>
                      {t("save")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingQuota(false)}>
                      {tr("cancel")}
                    </Button>
                  </div>
                )
              }
            >
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-[var(--color-text-muted)]">{t("used")}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatBytes(data.used_bytes)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-muted)]">{tr("quota")}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {formatQuotaDisplay(data.quota_bytes)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-muted)]">{tr("files")}</p>
                  <p className="text-lg font-semibold tabular-nums">{data.file_count}</p>
                </div>
              </div>

              {data.quota_bytes > 0 && (
                <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      storagePercent > 90
                        ? "bg-red-500"
                        : storagePercent > 70
                          ? "bg-amber-500"
                          : "bg-[var(--color-accent)]",
                    )}
                    style={{ width: `${storagePercent}%` }}
                  />
                </div>
              )}
            </Section>
          </section>
        </div>

        {/* Recent activity */}
        <section className="panel overflow-hidden">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-5 py-4">
            <FileText className="h-4 w-4 text-[var(--color-text-muted)]" />
            <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
              {t("recentActivity")}
            </h3>
            <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
              {ta("eventCount", { count: events.length })}
            </span>
          </div>

          {events.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-7 w-7 text-[var(--color-text-muted)]" />}
              title={t("noActivityTitle")}
              description={t("noActivityDesc")}
            />
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {events.map((event) => {
                const Icon = EVENT_ICONS[event.event_type] ?? Shield;
                const color =
                  eventColors[event.event_type] ??
                  "bg-slate-500/10 text-slate-600 dark:text-slate-400";
                return (
                  <div key={event.id} className="flex items-center gap-3 px-5 py-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
                        color,
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span
                        className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", color)}
                      >
                        {event.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                        {event.ip}
                      </span>
                    </div>
                    <span className="flex-shrink-0 text-xs text-[var(--color-text-muted)] tabular-nums">
                      {formatRelativeTime(event.created_at)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {modalProps && (
        <ConfirmModal
          open={!!confirmAction}
          onConfirm={executeAction}
          onClose={closeConfirm}
          title={modalProps.title}
          description={confirmAction!.detail}
          details={u.username}
          confirmLabel={modalProps.confirmLabel}
          variant={modalProps.variant}
          loading={busy}
          confirmDisabled={needsReauth && !reauthReady(reauth)}
        >
          {needsReauth && <ReauthFields value={reauth} onChange={setReauth} />}
          <NotifyFields value={notify} onChange={setNotify} />
        </ConfirmModal>
      )}
    </>
  );
}
