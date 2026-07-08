"use client";

import { memo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminSetUserRole, adminDeleteUser, adminSetUserQuota, adminSetUserPlan } from "@/lib/api";
import { formatBytes, cn, bytesToGb } from "@/lib/utils";
import { quotaModeFor, parseQuotaInput, formatQuotaDisplay, type QuotaMode } from "@/lib/quota";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { RoleBadge, PlanBadge } from "./badges";
import { Trash2, Check, X } from "@/lib/icons";
import { Role } from "@/types";
import type { AdminUser, PlanConfig } from "@/types";

const planSelectClass = (plan: string) =>
  cn(
    "h-8 w-[7.5rem] text-xs font-medium",
    plan === "pro"
      ? "border-violet-500/20 bg-violet-500/10 text-violet-600 dark:text-violet-400"
      : plan === "plus"
        ? "border-blue-500/20 bg-blue-500/10 text-blue-600 dark:text-blue-400"
        : ""
  );

type PlanDetails = Record<string, { label: string; uploads: number; storage: string; fileSize: string }>;

/**
 * Callbacks + derived data a row/card needs from the parent. Bundled into one
 * object so a row only takes a single reference-stable prop for all of them
 * (React Compiler keeps this object stable across renders when its members are),
 * which keeps the `memo` comparison cheap and lets unchanged rows bail out.
 */
interface RowHandlers {
  planDetails: PlanDetails;
  onNavigate: (userId: string) => void;
  onPlanChange: (userId: string, username: string, newPlan: string) => void;
  onRoleToggle: (userId: string, currentRole: Role, username: string) => void;
  onDelete: (userId: string, username: string) => void;
  onStartEditQuota: (u: AdminUser) => void;
  onSaveQuota: (userId: string) => void;
  onCancelEditQuota: () => void;
  onQuotaModeChange: (mode: QuotaMode) => void;
  onQuotaInputChange: (value: string) => void;
  getQuotaDisplay: (u: AdminUser) => string;
  getQuotaLabel: (u: AdminUser) => string;
}

/**
 * Quota cell — either the inline editor (when this row is being edited) or a
 * click-to-edit button. `quotaMode` / `quotaInput` are only meaningful while
 * `editing` is true; non-editing rows are handed stable sentinel values so their
 * props (and thus the memoized row wrapping them) don't churn on every keystroke
 * in some *other* row's editor.
 */
function QuotaEditor({
  u,
  editing,
  busy,
  quotaMode,
  quotaInput,
  h,
}: {
  u: AdminUser;
  editing: boolean;
  busy: boolean;
  quotaMode: QuotaMode;
  quotaInput: string;
  h: RowHandlers;
}) {
  if (!editing) {
    return (
      <button
        onClick={() => h.onStartEditQuota(u)}
        className="group rounded-md text-sm tabular-nums transition-colors hover:text-[var(--color-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
        title="Click to edit quota"
        aria-label={`Edit quota for ${u.username}`}
      >
        <span>{h.getQuotaDisplay(u)}</span>
        <span className="ml-1 text-[10px] text-[var(--color-text-muted)]">({h.getQuotaLabel(u)})</span>
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select value={quotaMode} onValueChange={(v) => h.onQuotaModeChange(v as QuotaMode)}>
        <SelectTrigger className="h-7 w-24 text-xs" aria-label="Quota mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Default</SelectItem>
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
          onChange={(e) => h.onQuotaInputChange(e.target.value)}
          className="w-16 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-2 py-1 text-xs tabular-nums outline-none focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
          placeholder="GB"
          aria-label="Quota in GB"
        />
      )}
      <IconButton
        icon={Check}
        label="Save quota"
        variant="primary"
        onClick={() => h.onSaveQuota(u.id)}
        disabled={busy}
        className="h-7 w-7"
        iconClassName="h-3.5 w-3.5"
      />
      <IconButton
        icon={X}
        label="Cancel"
        variant="ghost"
        onClick={h.onCancelEditQuota}
        className="h-7 w-7"
        iconClassName="h-3.5 w-3.5"
      />
    </div>
  );
}

/**
 * A single desktop table row. Memoized so parent state changes (another row's
 * `busy`, an unrelated quota edit, the confirm modal opening) don't re-render
 * every row — only rows whose own `user` / `busy` / `editing` / quota-edit
 * state actually changed. `h` is a reference-stable handler bundle, so React's
 * default shallow compare on it is a single identity check.
 */
interface RowProps {
  u: AdminUser;
  isSelf: boolean;
  busy: boolean;
  editing: boolean;
  quotaMode: QuotaMode;
  quotaInput: string;
  h: RowHandlers;
}

const UserTableRow = memo(function UserTableRow({
  u,
  isSelf,
  busy,
  editing,
  quotaMode,
  quotaInput,
  h,
}: RowProps) {
  return (
    <tr className="group border-b border-[var(--color-border)] transition-colors last:border-0 hover:bg-[var(--color-surface-1)]">
      <td className="px-5 py-3.5">
        <button
          onClick={() => h.onNavigate(u.id)}
          className="group/name rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
        >
          <p className="text-sm font-medium text-[var(--color-text)] transition-colors group-hover/name:text-[var(--color-accent)]">
            {u.username}
            {isSelf && (
              <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)]">(you)</span>
            )}
          </p>
          <p className="truncate text-xs text-[var(--color-text-muted)]">{u.email}</p>
        </button>
      </td>
      <td className="px-4 py-3.5">
        <RoleBadge role={u.role} />
      </td>
      <td className="px-4 py-3.5">
        {!isSelf ? (
          <Select
            value={u.plan || "free"}
            onValueChange={(v) => h.onPlanChange(u.id, u.username, v)}
            disabled={busy}
          >
            <SelectTrigger className={planSelectClass(u.plan || "free")} aria-label={`Plan for ${u.username}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(h.planDetails).map(([id, detail]) => (
                <SelectItem key={id} value={id}>{detail.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <PlanBadge plan={u.plan || "free"} />
        )}
      </td>
      <td className="px-4 py-3.5 text-right text-sm tabular-nums text-[var(--color-text-secondary)]">
        {u.file_count}
      </td>
      <td className="px-4 py-3.5 text-right text-sm tabular-nums text-[var(--color-text-secondary)]">
        {formatBytes(u.total_size)}
      </td>
      <td className="px-4 py-3.5 text-right text-sm">
        <QuotaEditor u={u} editing={editing} busy={busy} quotaMode={quotaMode} quotaInput={quotaInput} h={h} />
      </td>
      <td className="px-4 py-3.5 text-sm text-[var(--color-text-muted)] tabular-nums">
        {new Date(u.created_at).toLocaleDateString()}
      </td>
      <td className="px-5 py-3.5 text-right">
        {!isSelf && (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => h.onRoleToggle(u.id, u.role, u.username)}
              disabled={busy}
            >
              {u.role === Role.Admin ? "Demote" : "Promote"}
            </Button>
            <IconButton
              icon={Trash2}
              label="Delete user"
              variant="ghost"
              onClick={() => h.onDelete(u.id, u.username)}
              disabled={busy}
              className="hover:bg-red-500/10 hover:text-red-500"
            />
          </div>
        )}
      </td>
    </tr>
  );
});

/** Mobile card equivalent of {@link UserTableRow}; same memoization rationale. */
const UserMobileCard = memo(function UserMobileCard({
  u,
  isSelf,
  busy,
  editing,
  quotaMode,
  quotaInput,
  h,
}: RowProps) {
  return (
    <div className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <button
          onClick={() => h.onNavigate(u.id)}
          className="group min-w-0 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
        >
          <p className="truncate text-sm font-medium text-[var(--color-text)] transition-colors group-hover:text-[var(--color-accent)]">
            {u.username}
            {isSelf && <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)]">(you)</span>}
          </p>
          <p className="truncate text-xs text-[var(--color-text-muted)]">{u.email}</p>
        </button>
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <RoleBadge role={u.role} />
          {isSelf ? (
            <PlanBadge plan={u.plan || "free"} />
          ) : (
            <Select
              value={u.plan || "free"}
              onValueChange={(v) => h.onPlanChange(u.id, u.username, v)}
              disabled={busy}
            >
              <SelectTrigger className={cn(planSelectClass(u.plan || "free"), "w-[6.5rem]")} aria-label={`Plan for ${u.username}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(h.planDetails).map(([id, detail]) => (
                  <SelectItem key={id} value={id}>{detail.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 text-xs">
        <div>
          <p className="text-[var(--color-text-muted)]">Files</p>
          <p className="font-medium tabular-nums">{u.file_count}</p>
        </div>
        <div>
          <p className="text-[var(--color-text-muted)]">Usage</p>
          <p className="font-medium tabular-nums">{formatBytes(u.total_size)}</p>
        </div>
        <div>
          <p className="text-[var(--color-text-muted)]">Joined</p>
          <p className="font-medium tabular-nums">{new Date(u.created_at).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="text-xs">
          <span className="mr-1 text-[var(--color-text-muted)]">Quota:</span>
          <QuotaEditor u={u} editing={editing} busy={busy} quotaMode={quotaMode} quotaInput={quotaInput} h={h} />
        </div>
        {!isSelf && (
          <div className="flex flex-shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => h.onRoleToggle(u.id, u.role, u.username)}
              disabled={busy}
            >
              {u.role === Role.Admin ? "Demote" : "Promote"}
            </Button>
            <IconButton
              icon={Trash2}
              label="Delete user"
              variant="ghost"
              onClick={() => h.onDelete(u.id, u.username)}
              disabled={busy}
              className="hover:bg-red-500/10 hover:text-red-500"
            />
          </div>
        )}
      </div>
    </div>
  );
});

// Stable sentinels for rows that are NOT being edited, so their quota props stay
// referentially constant and the memoized row bails out while another row edits.
const NO_QUOTA_MODE: QuotaMode = "default";
const NO_QUOTA_INPUT = "";

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
  const [quotaMode, setQuotaMode] = useState<QuotaMode>("default");

  const [confirmAction, setConfirmAction] = useState<{
    type: "delete" | "role" | "plan";
    userId: string;
    userName: string;
    detail: string;
    newValue?: string;
  } | null>(null);

  const startEditQuota = (u: AdminUser) => {
    setEditingQuota(u.id);
    const mode = quotaModeFor(u.storage_quota);
    setQuotaMode(mode);
    setQuotaInput(mode === "custom" ? bytesToGb(u.storage_quota!).toString() : "");
  };

  const saveQuota = async (userId: string) => {
    setBusy(userId);
    try {
      const parsed = parseQuotaInput(quotaMode, quotaInput);
      if (!parsed.ok) {
        toast.error(parsed.error);
        setBusy(null);
        return;
      }
      await adminSetUserQuota(userId, parsed.bytes);
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
    const planConfig = planConfigs?.find((p) => p.id === (u.plan || "free"));
    return formatQuotaDisplay(u.storage_quota, {
      planDisplay: planConfig?.storage_display,
      defaultBytes: defaultQuotaBytes,
    });
  };

  const getQuotaLabel = (u: AdminUser) => (u.storage_quota === null ? "plan" : "override");

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

  const planDetails: PlanDetails = planConfigs
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
        return { title: "Delete user", description: confirmAction.detail, confirmLabel: "Delete user", variant: "danger" as const };
      case "role":
        return {
          title: confirmAction.newValue === "admin" ? "Promote to admin" : "Demote to user",
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
          confirmLabel: isUpgrade ? "Upgrade" : "Change plan",
          variant: isUpgrade ? ("info" as const) : ("warning" as const),
        };
      }
    }
  };

  const modalProps = getConfirmModalProps();

  // One reference-stable bundle of everything a row needs. React Compiler
  // (enabled repo-wide) memoizes this object + its member callbacks, so the
  // memoized rows see the same `h` identity across parent renders and bail out.
  const handlers: RowHandlers = {
    planDetails,
    onNavigate: (userId) => router.push(`/admin/users/${userId}`),
    onPlanChange: handlePlanChange,
    onRoleToggle: handleRoleToggle,
    onDelete: handleDelete,
    onStartEditQuota: startEditQuota,
    onSaveQuota: saveQuota,
    onCancelEditQuota: () => setEditingQuota(null),
    onQuotaModeChange: setQuotaMode,
    onQuotaInputChange: setQuotaInput,
    getQuotaDisplay,
    getQuotaLabel,
  };

  return (
    <>
      <section className="panel overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">Users</h2>
          <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
            <span className="tabular-nums">{users.length}</span> registered user{users.length !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Desktop table */}
        <div className="hidden max-h-[65vh] overflow-x-auto lg:block">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)] text-xs uppercase tracking-wider text-[var(--color-text-muted)]">
                <th className="px-5 py-3 text-left font-medium">User</th>
                <th className="px-4 py-3 text-left font-medium">Role</th>
                <th className="px-4 py-3 text-left font-medium">Plan</th>
                <th className="px-4 py-3 text-right font-medium">Files</th>
                <th className="px-4 py-3 text-right font-medium">Usage</th>
                <th className="px-4 py-3 text-right font-medium">Quota</th>
                <th className="px-4 py-3 text-left font-medium">Joined</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const editing = editingQuota === u.id;
                return (
                  <UserTableRow
                    key={u.id}
                    u={u}
                    isSelf={u.id === currentUserId}
                    busy={busy === u.id}
                    editing={editing}
                    quotaMode={editing ? quotaMode : NO_QUOTA_MODE}
                    quotaInput={editing ? quotaInput : NO_QUOTA_INPUT}
                    h={handlers}
                  />
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile card layout */}
        <div className="max-h-[65vh] divide-y divide-[var(--color-border)] overflow-y-auto lg:hidden">
          {users.map((u) => {
            const editing = editingQuota === u.id;
            return (
              <UserMobileCard
                key={u.id}
                u={u}
                isSelf={u.id === currentUserId}
                busy={busy === u.id}
                editing={editing}
                quotaMode={editing ? quotaMode : NO_QUOTA_MODE}
                quotaInput={editing ? quotaInput : NO_QUOTA_INPUT}
                h={handlers}
              />
            );
          })}
        </div>
      </section>

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
