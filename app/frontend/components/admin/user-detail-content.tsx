"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { adminGetUser, adminSetUserRole, adminDeleteUser, adminSetUserQuota, adminSetUserPlan, adminGetPlans } from "@/lib/api";
import { formatBytes, cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Role } from "@/types";
import type { AdminUserDetail, PlanConfig } from "@/types";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { UserDetailSkeleton } from "@/components/admin/skeletons";
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
import {
  ArrowLeft,
  Shield,
  Mail,
  Clock,
  HardDrive,
  Crown,
  ShieldCheck,
  User,
  Trash2,
  LogIn,
  LogOut,
  UserPlus,
  Key,
  Link2,
  Upload,
  Download,
  Settings,
  FileText,
} from "@/lib/icons";

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

export function AdminUserDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [planConfigs, setPlanConfigs] = useState<PlanConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  const [confirmAction, setConfirmAction] = useState<{
    type: "delete" | "role" | "plan";
    detail: string;
    newValue?: string;
  } | null>(null);

  const [editingQuota, setEditingQuota] = useState(false);
  const [quotaMode, setQuotaMode] = useState<"default" | "custom" | "unlimited">("default");
  const [quotaInput, setQuotaInput] = useState("");

  const fetchUser = async () => {
    setError(false);
    try {
      const [res, plans] = await Promise.all([adminGetUser(id), adminGetPlans()]);
      setData(res);
      setPlanConfigs(plans.plans);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser?.role === Role.Admin) {
      fetchUser();
    }
  }, [currentUser, id]);

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
          Back to users
        </Link>
        <div className="panel p-6">
          <EmptyState
            icon={<User className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title="Couldn't load user"
            description="We couldn't reach the server to load this user's details. Check your connection and try again."
            action={
              <Button variant="secondary" size="sm" onClick={fetchUser}>
                Try again
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  const u = data.user;
  const isSelf = u.id === currentUser.id;
  const storagePercent = data.quota_bytes > 0 ? Math.min((data.used_bytes / data.quota_bytes) * 100, 100) : 0;
  const events = data.events ?? [];
  const userPlanConfig = planConfigs.find((p) => p.id === (u.plan || "free"));

  const handleRoleToggle = () => {
    const newRole = u.role === Role.Admin ? Role.User : Role.Admin;
    setConfirmAction({
      type: "role",
      detail: u.role === Role.Admin
        ? `${u.username} will lose admin privileges.`
        : `${u.username} will gain full admin access.`,
      newValue: newRole,
    });
  };

  const handleDelete = () => {
    setConfirmAction({
      type: "delete",
      detail: `All files, tokens, and data for "${u.username}" will be permanently deleted. This cannot be undone.`,
    });
  };

  const handlePlanChange = (newPlan: string) => {
    const targetConfig = planConfigs.find((p) => p.id === newPlan);
    const label = targetConfig?.name || newPlan;
    setConfirmAction({
      type: "plan",
      detail: `Change ${u.username} to ${label} plan${targetConfig ? ` (${targetConfig.storage_display} storage, ${targetConfig.max_file_display} max file, ${targetConfig.concurrent_display})` : ""}.`,
      newValue: newPlan,
    });
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction.type === "delete") {
        await adminDeleteUser(u.id);
        toast.success("User deleted");
        router.push("/admin/users");
        return;
      } else if (confirmAction.type === "role") {
        await adminSetUserRole(u.id, confirmAction.newValue!);
        toast.success(`Role updated to ${confirmAction.newValue}`);
      } else if (confirmAction.type === "plan") {
        await adminSetUserPlan(u.id, confirmAction.newValue!);
        toast.success(`Plan updated to ${confirmAction.newValue}`);
      }
      setConfirmAction(null);
      fetchUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const startEditQuota = () => {
    setEditingQuota(true);
    if (u.storage_quota === null) {
      setQuotaMode("default");
      setQuotaInput("");
    } else if (u.storage_quota === 0) {
      setQuotaMode("unlimited");
      setQuotaInput("");
    } else {
      setQuotaMode("custom");
      setQuotaInput((u.storage_quota / (1024 * 1024 * 1024)).toString());
    }
  };

  const saveQuota = async () => {
    setBusy(true);
    try {
      let quotaBytes: number | null = null;
      if (quotaMode === "unlimited") quotaBytes = 0;
      else if (quotaMode === "custom") {
        const gb = parseFloat(quotaInput);
        if (isNaN(gb) || gb <= 0) {
          toast.error("Enter a valid quota in GB");
          setBusy(false);
          return;
        }
        quotaBytes = Math.round(gb * 1024 * 1024 * 1024);
      }
      await adminSetUserQuota(u.id, quotaBytes);
      toast.success("Quota updated");
      setEditingQuota(false);
      fetchUser();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update quota");
    } finally {
      setBusy(false);
    }
  };

  const getConfirmModalProps = () => {
    if (!confirmAction) return null;
    switch (confirmAction.type) {
      case "delete":
        return { title: "Delete user", confirmLabel: "Delete user", variant: "danger" as const };
      case "role":
        return {
          title: confirmAction.newValue === "admin" ? "Promote to admin" : "Demote to user",
          confirmLabel: confirmAction.newValue === "admin" ? "Promote" : "Demote",
          variant: "warning" as const,
        };
      case "plan": {
        const targetConfig = planConfigs.find((p) => p.id === confirmAction.newValue);
        return { title: `Change to ${targetConfig?.name || confirmAction.newValue}`, confirmLabel: "Change plan", variant: "warning" as const };
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
          Back to users
        </Link>

        {/* User header */}
        <section className="panel p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] ring-1 ring-[var(--color-border)]">
                <User className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--color-text)]">{u.username}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--color-text-muted)]">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {u.email}
                  </span>
                  <span className="flex items-center gap-1 tabular-nums">
                    <Clock className="h-3.5 w-3.5" />
                    Joined {new Date(u.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                    u.role === Role.Admin
                      ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                  )}>
                    {u.role === Role.Admin ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {u.role}
                  </span>
                  <span className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
                    (u.plan || "free") === "pro"
                      ? "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400"
                      : (u.plan || "free") === "plus"
                        ? "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400"
                        : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                  )}>
                    {["pro", "plus"].includes(u.plan || "free") && <Crown className="h-3 w-3" />}
                    {u.plan || "free"}
                  </span>
                  {u.totp_enabled && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-green-500/20 bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600 dark:text-green-400">
                      <Shield className="h-3 w-3" />
                      2FA
                    </span>
                  )}
                  {u.email_verified && (
                    <span className="text-xs text-green-600 dark:text-green-400">Verified</span>
                  )}
                </div>
              </div>
            </div>

            {!isSelf && (
              <div className="flex flex-shrink-0 items-center gap-2">
                <Select value={u.plan || "free"} onValueChange={handlePlanChange} disabled={busy}>
                  <SelectTrigger className="h-9 w-28 text-xs" aria-label="Change plan">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {sortedPlans.length > 0
                      ? sortedPlans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)
                      : ["free", "plus", "pro", "team"].map((p) => (
                          <SelectItem key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</SelectItem>
                        ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="sm" onClick={handleRoleToggle} disabled={busy}>
                  {u.role === Role.Admin ? "Demote" : "Promote"}
                </Button>
                <Button variant="danger" size="sm" onClick={handleDelete} disabled={busy}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Plan details + Storage usage */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {userPlanConfig && (
            <section className="panel p-6">
              <Section title={`${userPlanConfig.name} plan limits`}>
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-[var(--color-border)] py-2">
                    <span className="text-xs text-[var(--color-text-muted)]">Storage</span>
                    <span className="text-sm font-semibold tabular-nums">{userPlanConfig.storage_display}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--color-border)] py-2">
                    <span className="text-xs text-[var(--color-text-muted)]">Max file size</span>
                    <span className="text-sm font-semibold tabular-nums">{userPlanConfig.max_file_display}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-[var(--color-border)] py-2">
                    <span className="text-xs text-[var(--color-text-muted)]">Concurrent uploads</span>
                    <span className="text-sm font-semibold tabular-nums">{userPlanConfig.concurrent_display}</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-[var(--color-text-muted)]">Price</span>
                    <span className="text-sm font-semibold tabular-nums">
                      {userPlanConfig.monthly_price > 0 ? `$${userPlanConfig.monthly_price}/mo` : "Free"}
                    </span>
                  </div>
                </div>
              </Section>
            </section>
          )}

          <section className="panel p-6">
            <Section
              title="Storage usage"
              actions={
                !editingQuota ? (
                  <Button variant="ghost" size="sm" onClick={startEditQuota}>
                    Override quota
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <Select value={quotaMode} onValueChange={(v) => setQuotaMode(v as typeof quotaMode)}>
                      <SelectTrigger className="h-8 w-28 text-xs" aria-label="Quota mode">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Plan default</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                        <SelectItem value="unlimited">Unlimited</SelectItem>
                      </SelectContent>
                    </Select>
                    {quotaMode === "custom" && (
                      <input
                        type="number"
                        min="0.1"
                        step="0.5"
                        value={quotaInput}
                        onChange={(e) => setQuotaInput(e.target.value)}
                        className="w-20 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2 py-1 text-xs tabular-nums outline-none focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
                        placeholder="GB"
                        aria-label="Quota in GB"
                      />
                    )}
                    <Button variant="primary" size="sm" onClick={saveQuota} disabled={busy}>
                      Save
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditingQuota(false)}>
                      Cancel
                    </Button>
                  </div>
                )
              }
            >
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-[var(--color-text-muted)]">Used</p>
                  <p className="text-lg font-semibold tabular-nums">{formatBytes(data.used_bytes)}</p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-muted)]">Quota</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {data.quota_bytes === 0 ? "Unlimited" : formatBytes(data.quota_bytes)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[var(--color-text-muted)]">Files</p>
                  <p className="text-lg font-semibold tabular-nums">{data.file_count}</p>
                </div>
              </div>

              {data.quota_bytes > 0 && (
                <div className="h-2 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-amber-500" : "bg-[var(--color-accent)]"
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
            <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">Recent activity</h3>
            <span className="text-xs text-[var(--color-text-muted)] tabular-nums">({events.length} events)</span>
          </div>

          {events.length === 0 ? (
            <EmptyState
              icon={<Clock className="h-7 w-7 text-[var(--color-text-muted)]" />}
              title="No recent activity"
              description="This user hasn't generated any audited activity yet."
            />
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {events.map((event) => {
                const Icon = eventIcons[event.event_type] ?? Shield;
                const color = eventColors[event.event_type] ?? "bg-slate-500/10 text-slate-600 dark:text-slate-400";
                return (
                  <div key={event.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={cn("flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg", color)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold", color)}>
                        {event.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="ml-2 text-xs text-[var(--color-text-muted)]">{event.ip}</span>
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
          onClose={() => setConfirmAction(null)}
          title={modalProps.title}
          description={confirmAction!.detail}
          details={u.username}
          confirmLabel={modalProps.confirmLabel}
          variant={modalProps.variant}
          loading={busy}
        />
      )}
    </>
  );
}
