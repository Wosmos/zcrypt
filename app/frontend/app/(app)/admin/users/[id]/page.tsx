"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { adminGetUser, adminSetUserRole, adminDeleteUser, adminSetUserQuota, adminSetUserPlan, adminGetPlans } from "@/lib/api";
import { formatBytes, cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Role } from "@/types";
import type { AdminUserDetail, PlanConfig } from "@/types";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { UserDetailSkeleton } from "@/components/admin/skeletons";
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
import Link from "next/link";

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

export default function AdminUserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user: currentUser } = useAuthStore();
  const [data, setData] = useState<AdminUserDetail | null>(null);
  const [planConfigs, setPlanConfigs] = useState<PlanConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [confirmAction, setConfirmAction] = useState<{
    type: "delete" | "role" | "plan";
    detail: string;
    newValue?: string;
  } | null>(null);

  // Quota editing
  const [editingQuota, setEditingQuota] = useState(false);
  const [quotaMode, setQuotaMode] = useState<"default" | "custom" | "unlimited">("default");
  const [quotaInput, setQuotaInput] = useState("");

  const fetchUser = async () => {
    try {
      const [res, plans] = await Promise.all([
        adminGetUser(id),
        adminGetPlans(),
      ]);
      setData(res);
      setPlanConfigs(plans.plans);
    } catch {
      toast.error("Failed to load user");
      router.push("/admin/users");
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
  if (loading || !data) return <UserDetailSkeleton />;

  const u = data.user;
  const isSelf = u.id === currentUser.id;
  const storagePercent = data.quota_bytes > 0 ? Math.min((data.used_bytes / data.quota_bytes) * 100, 100) : 0;
  const events = data.events ?? [];

  // Get current plan config for this user
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
        return { title: "Delete User", confirmLabel: "Delete User", variant: "danger" as const };
      case "role":
        return {
          title: confirmAction.newValue === "admin" ? "Promote to Admin" : "Demote to User",
          confirmLabel: confirmAction.newValue === "admin" ? "Promote" : "Demote",
          variant: "warning" as const,
        };
      case "plan": {
        const targetConfig = planConfigs.find((p) => p.id === confirmAction.newValue);
        return { title: `Change to ${targetConfig?.name || confirmAction.newValue}`, confirmLabel: "Change Plan", variant: "warning" as const };
      }
    }
  };

  const modalProps = getConfirmModalProps();

  return (
    <>
      <div className="space-y-6">
        {/* Back link */}
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Users
        </Link>

        {/* User header card */}
        <section className="card p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-[var(--color-surface-2)] text-[var(--color-text-muted)]">
                <User className="h-7 w-7" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{u.username}</h2>
                <div className="flex items-center gap-3 mt-1 text-sm text-[var(--color-text-muted)]">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5" />
                    {u.email}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    Joined {new Date(u.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border",
                    u.role === Role.Admin
                      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border-[var(--color-border)]"
                  )}>
                    {u.role === Role.Admin ? <ShieldCheck className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    {u.role}
                  </span>
                  <span className={cn(
                    "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border",
                    (u.plan || "free") === "pro"
                      ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
                      : (u.plan || "free") === "plus"
                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                        : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border-[var(--color-border)]"
                  )}>
                    {["pro", "plus"].includes(u.plan || "free") && <Crown className="h-3 w-3" />}
                    {u.plan || "free"}
                  </span>
                  {u.totp_enabled && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20">
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

            {/* Actions */}
            {!isSelf && (
              <div className="flex items-center gap-2">
                <select
                  value={u.plan || "free"}
                  onChange={(e) => handlePlanChange(e.target.value)}
                  disabled={busy}
                  className="text-xs font-medium px-2.5 py-1.5 rounded-lg border bg-[var(--color-surface-1)] border-[var(--color-border)] cursor-pointer disabled:opacity-50"
                >
                  {planConfigs.length > 0
                    ? planConfigs.sort((a, b) => a.sort_order - b.sort_order).map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))
                    : <>
                        <option value="free">Free</option>
                        <option value="plus">Plus</option>
                        <option value="pro">Pro</option>
                        <option value="team">Team</option>
                      </>
                  }
                </select>
                <button
                  onClick={handleRoleToggle}
                  disabled={busy}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
                >
                  {u.role === Role.Admin ? "Demote" : "Promote"}
                </button>
                <button
                  onClick={handleDelete}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Plan details + Storage usage */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Plan limits card */}
          {userPlanConfig && (
            <section className="card p-6">
              <div className="flex items-center gap-2 mb-4">
                <Crown className="h-4 w-4 text-[var(--color-text-muted)]" />
                <h3 className="text-sm font-semibold">{userPlanConfig.name} Plan Limits</h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                  <span className="text-xs text-[var(--color-text-muted)]">Storage</span>
                  <span className="text-sm font-semibold">{userPlanConfig.storage_display}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                  <span className="text-xs text-[var(--color-text-muted)]">Max file size</span>
                  <span className="text-sm font-semibold">{userPlanConfig.max_file_display}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-[var(--color-border)]">
                  <span className="text-xs text-[var(--color-text-muted)]">Concurrent uploads</span>
                  <span className="text-sm font-semibold">{userPlanConfig.concurrent_display}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-xs text-[var(--color-text-muted)]">Price</span>
                  <span className="text-sm font-semibold">
                    {userPlanConfig.monthly_price > 0 ? `$${userPlanConfig.monthly_price}/mo` : "Free"}
                  </span>
                </div>
              </div>
            </section>
          )}

          {/* Storage usage card */}
          <section className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-[var(--color-text-muted)]" />
                <h3 className="text-sm font-semibold">Storage Usage</h3>
              </div>
              {!editingQuota ? (
                <button
                  onClick={startEditQuota}
                  className="text-xs text-[var(--color-accent)] hover:underline"
                >
                  Override quota
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <select
                    value={quotaMode}
                    onChange={(e) => setQuotaMode(e.target.value as "default" | "custom" | "unlimited")}
                    className="text-xs px-2 py-1 rounded bg-[var(--color-surface-1)] border border-[var(--color-border)]"
                  >
                    <option value="default">Plan default</option>
                    <option value="custom">Custom</option>
                    <option value="unlimited">Unlimited</option>
                  </select>
                  {quotaMode === "custom" && (
                    <input
                      type="number"
                      min="0.1"
                      step="0.5"
                      value={quotaInput}
                      onChange={(e) => setQuotaInput(e.target.value)}
                      className="w-20 text-xs px-2 py-1 rounded bg-[var(--color-surface-1)] border border-[var(--color-border)] tabular-nums"
                      placeholder="GB"
                    />
                  )}
                  <button
                    onClick={saveQuota}
                    disabled={busy}
                    className="text-xs px-2 py-1 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setEditingQuota(false)}
                    className="text-xs px-2 py-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-3 gap-4 mb-4">
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
              <div className="h-2 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    storagePercent > 90 ? "bg-red-500" : storagePercent > 70 ? "bg-amber-500" : "bg-cyan-500"
                  )}
                  style={{ width: `${storagePercent}%` }}
                />
              </div>
            )}
          </section>
        </div>

        {/* Recent activity */}
        <section className="card overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
            <FileText className="h-4 w-4 text-[var(--color-text-muted)]" />
            <h3 className="text-sm font-semibold">Recent Activity</h3>
            <span className="text-xs text-[var(--color-text-muted)]">
              ({events.length} events)
            </span>
          </div>

          <div className="divide-y divide-[var(--color-border)]">
            {events.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">
                No recent activity
              </div>
            ) : (
              events.map((event) => {
                const Icon = eventIcons[event.event_type] ?? Shield;
                const color = eventColors[event.event_type] ?? "bg-slate-500/10 text-slate-600 dark:text-slate-400";
                return (
                  <div key={event.id} className="flex items-center gap-3 px-5 py-3">
                    <div className={cn("flex items-center justify-center h-8 w-8 rounded-lg flex-shrink-0", color)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded", color)}>
                        {event.event_type.replace(/_/g, " ")}
                      </span>
                      <span className="ml-2 text-xs text-[var(--color-text-muted)]">{event.ip}</span>
                    </div>
                    <span className="text-xs text-[var(--color-text-muted)] tabular-nums flex-shrink-0">
                      {formatRelativeTime(event.created_at)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Confirm modal */}
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
