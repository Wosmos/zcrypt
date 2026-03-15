"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminSetUserRole, adminDeleteUser, adminSetUserQuota, adminSetUserPlan } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { Trash2, ShieldCheck, User, Crown } from "@/lib/icons";
import { Role } from "@/types";
import type { AdminUser, PlanConfig } from "@/types";
import { ConfirmModal } from "@/components/ui/confirm-modal";

export function UserTable({
  users,
  currentUserId,
  defaultQuotaBytes,
  onRefresh,
  planConfigs,
}: {
  users: AdminUser[];
  currentUserId: string;
  defaultQuotaBytes: number;
  onRefresh: () => void;
  planConfigs?: PlanConfig[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editingQuota, setEditingQuota] = useState<string | null>(null);
  const [quotaInput, setQuotaInput] = useState("");
  const [quotaMode, setQuotaMode] = useState<"default" | "custom" | "unlimited">("default");

  // Confirm modal state
  const [confirmAction, setConfirmAction] = useState<{
    type: "delete" | "role" | "plan";
    userId: string;
    userName: string;
    detail: string;
    newValue?: string;
  } | null>(null);

  const startEditQuota = (u: AdminUser) => {
    setEditingQuota(u.id);
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

  const saveQuota = async (userId: string) => {
    setBusy(userId);
    try {
      let quotaBytes: number | null = null;
      if (quotaMode === "unlimited") quotaBytes = 0;
      else if (quotaMode === "custom") {
        const gb = parseFloat(quotaInput);
        if (isNaN(gb) || gb <= 0) {
          toast.error("Enter a valid quota in GB");
          setBusy(null);
          return;
        }
        quotaBytes = Math.round(gb * 1024 * 1024 * 1024);
      }
      await adminSetUserQuota(userId, quotaBytes);
      toast.success("Quota updated");
      setEditingQuota(null);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update quota");
    } finally {
      setBusy(null);
    }
  };

  const getQuotaDisplay = (u: AdminUser) => {
    if (u.storage_quota === null) {
      // Use plan-based storage if available
      const planConfig = planConfigs?.find((p) => p.id === (u.plan || "free"));
      if (planConfig) return planConfig.storage_display;
      return defaultQuotaBytes > 0
        ? formatBytes(defaultQuotaBytes)
        : "Unlimited";
    }
    if (u.storage_quota === 0) return "Unlimited";
    return formatBytes(u.storage_quota);
  };

  const getQuotaLabel = (u: AdminUser) => {
    if (u.storage_quota === null) return "plan";
    if (u.storage_quota === 0) return "override";
    return "override";
  };

  const handleRoleToggle = (userId: string, currentRole: Role, username: string) => {
    const newRole = currentRole === Role.Admin ? Role.User : Role.Admin;
    setConfirmAction({
      type: "role",
      userId,
      userName: username,
      detail: currentRole === Role.Admin
        ? `${username} will lose admin privileges and become a regular user.`
        : `${username} will gain full admin access including user management and system settings.`,
      newValue: newRole,
    });
  };

  const handleDelete = (userId: string, username: string) => {
    setConfirmAction({
      type: "delete",
      userId,
      userName: username,
      detail: `All files, tokens, and data for "${username}" will be permanently deleted. This cannot be undone.`,
    });
  };

  const planDetails: Record<string, { label: string; uploads: number; storage: string; fileSize: string }> = planConfigs
    ? Object.fromEntries(
        planConfigs.map((p) => [
          p.id,
          { label: p.name, uploads: p.max_concurrent_uploads, storage: p.storage_display, fileSize: p.max_file_display },
        ])
      )
    : {
        free: { label: "Free", uploads: 2, storage: "10 GB", fileSize: "500 MB" },
        plus: { label: "Plus", uploads: 5, storage: "200 GB", fileSize: "5 GB" },
        pro: { label: "Pro", uploads: 10, storage: "2 TB", fileSize: "25 GB" },
      };

  const handlePlanChange = (userId: string, username: string, newPlan: string) => {
    const plan = planDetails[newPlan] || planDetails.free;
    const planOrder = Object.keys(planDetails);
    const currentUser = users.find((u) => u.id === userId);
    const currentPlanIdx = planOrder.indexOf(currentUser?.plan || "free");
    const newPlanIdx = planOrder.indexOf(newPlan);
    const isUpgrade = newPlanIdx > currentPlanIdx;

    setConfirmAction({
      type: "plan",
      userId,
      userName: username,
      detail: `${username} will be ${isUpgrade ? "upgraded" : "changed"} to ${plan.label} plan (${plan.uploads} concurrent uploads, ${plan.storage} storage, ${plan.fileSize} max file size).`,
      newValue: newPlan,
    });
  };

  const executeConfirmAction = async () => {
    if (!confirmAction) return;
    setBusy(confirmAction.userId);
    try {
      if (confirmAction.type === "delete") {
        await adminDeleteUser(confirmAction.userId);
        toast.success("User deleted");
      } else if (confirmAction.type === "role") {
        await adminSetUserRole(confirmAction.userId, confirmAction.newValue!);
        toast.success(`Role updated to ${confirmAction.newValue}`);
      } else if (confirmAction.type === "plan") {
        await adminSetUserPlan(confirmAction.userId, confirmAction.newValue!);
        toast.success(`Plan updated to ${confirmAction.newValue}`);
      }
      setConfirmAction(null);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : `Failed to ${confirmAction.type}`);
    } finally {
      setBusy(null);
    }
  };

  const getConfirmModalProps = () => {
    if (!confirmAction) return null;
    switch (confirmAction.type) {
      case "delete":
        return {
          title: "Delete User",
          description: confirmAction.detail,
          confirmLabel: "Delete User",
          variant: "danger" as const,
        };
      case "role":
        return {
          title: confirmAction.newValue === "admin" ? "Promote to Admin" : "Demote to User",
          description: confirmAction.detail,
          confirmLabel: confirmAction.newValue === "admin" ? "Promote" : "Demote",
          variant: "warning" as const,
        };
      case "plan": {
        const planOrder = Object.keys(planDetails);
        const targetUser = users.find((u) => u.id === confirmAction.userId);
        const currentIdx = planOrder.indexOf(targetUser?.plan || "free");
        const newIdx = planOrder.indexOf(confirmAction.newValue || "free");
        const isUpgrade = newIdx > currentIdx;
        const planLabel = planDetails[confirmAction.newValue || "free"]?.label || confirmAction.newValue;
        return {
          title: isUpgrade ? `Upgrade to ${planLabel}` : `Change to ${planLabel}`,
          description: confirmAction.detail,
          confirmLabel: isUpgrade ? "Upgrade" : "Change Plan",
          variant: isUpgrade ? ("info" as const) : ("warning" as const),
        };
      }
    }
  };

  const modalProps = getConfirmModalProps();

  return (
    <>
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">Users</h2>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            {users.length} registered user{users.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">User</th>
                <th className="text-left px-5 py-3 font-medium">Role</th>
                <th className="text-left px-5 py-3 font-medium">Plan</th>
                <th className="text-right px-5 py-3 font-medium">Files</th>
                <th className="text-right px-5 py-3 font-medium">Usage</th>
                <th className="text-right px-5 py-3 font-medium">Quota</th>
                <th className="text-left px-5 py-3 font-medium">Joined</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = u.id === currentUserId;
                return (
                  <tr
                    key={u.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-1)] transition-colors"
                  >
                    <td className="px-5 py-3">
                      <button
                        onClick={() => router.push(`/admin/users/${u.id}`)}
                        className="text-left group"
                      >
                        <p className="font-medium text-sm group-hover:text-[var(--color-accent)] transition-colors">
                          {u.username}
                          {isSelf && (
                            <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)]">
                              (you)
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {u.email}
                        </p>
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                          u.role === Role.Admin
                            ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                            : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                        )}
                      >
                        {u.role === Role.Admin ? (
                          <ShieldCheck className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {!isSelf ? (
                        <select
                          value={u.plan || "free"}
                          onChange={(e) => handlePlanChange(u.id, u.username, e.target.value)}
                          disabled={busy === u.id}
                          className={cn(
                            "text-xs font-medium px-2 py-1 rounded-lg border cursor-pointer transition-colors disabled:opacity-50",
                            (u.plan || "free") === "pro"
                              ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
                              : (u.plan || "free") === "plus"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border-[var(--color-border)]"
                          )}
                        >
                          {Object.entries(planDetails).map(([id, detail]) => (
                            <option key={id} value={id}>{detail.label}</option>
                          ))}
                        </select>
                      ) : (
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
                            (u.plan || "free") === "pro"
                              ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20"
                              : (u.plan || "free") === "plus"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20"
                                : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                          )}
                        >
                          {["pro", "plus"].includes(u.plan || "free") && <Crown className="h-3 w-3" />}
                          {(u.plan || "free")}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-sm">
                      {u.file_count}
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums text-sm">
                      {formatBytes(u.total_size)}
                    </td>
                    <td className="px-5 py-3 text-right text-sm">
                      {editingQuota === u.id ? (
                        <div className="flex items-center justify-end gap-1.5">
                          <select
                            value={quotaMode}
                            onChange={(e) => setQuotaMode(e.target.value as "default" | "custom" | "unlimited")}
                            className="text-xs px-1.5 py-1 rounded bg-[var(--color-surface-1)] border border-[var(--color-border)]"
                          >
                            <option value="default">Default</option>
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
                              className="w-16 text-xs px-1.5 py-1 rounded bg-[var(--color-surface-1)] border border-[var(--color-border)] tabular-nums"
                              placeholder="GB"
                            />
                          )}
                          <button
                            onClick={() => saveQuota(u.id)}
                            disabled={busy === u.id}
                            className="text-[10px] px-1.5 py-1 rounded bg-cyan-600 text-white hover:bg-cyan-700 disabled:opacity-50"
                          >
                            OK
                          </button>
                          <button
                            onClick={() => setEditingQuota(null)}
                            className="text-[10px] px-1.5 py-1 rounded hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                          >
                            X
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditQuota(u)}
                          className="hover:underline tabular-nums group"
                          title="Click to edit quota"
                        >
                          <span>{getQuotaDisplay(u)}</span>
                          <span className="ml-1 text-[10px] text-[var(--color-text-muted)]">
                            ({getQuotaLabel(u)})
                          </span>
                        </button>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-[var(--color-text-muted)]">
                      {new Date(u.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!isSelf && (
                          <>
                            <button
                              onClick={() => handleRoleToggle(u.id, u.role, u.username)}
                              disabled={busy === u.id}
                              className="text-xs px-2.5 py-1.5 rounded-lg hover:bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors disabled:opacity-50"
                              title={`Make ${u.role === Role.Admin ? "user" : "admin"}`}
                            >
                              {u.role === Role.Admin ? "Demote" : "Promote"}
                            </button>
                            <button
                              onClick={() => handleDelete(u.id, u.username)}
                              disabled={busy === u.id}
                              className="flex items-center justify-center h-7 w-7 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-colors disabled:opacity-50"
                              title="Delete user"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Confirm modal for big actions */}
      {modalProps && (
        <ConfirmModal
          open={!!confirmAction}
          onConfirm={executeConfirmAction}
          onClose={() => setConfirmAction(null)}
          title={modalProps.title}
          description={modalProps.description}
          details={confirmAction?.userName}
          confirmLabel={modalProps.confirmLabel}
          variant={modalProps.variant}
          loading={busy === confirmAction?.userId}
        />
      )}
    </>
  );
}
