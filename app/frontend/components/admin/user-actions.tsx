"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { adminDeleteUser, adminSetUserPlan, adminSetUserQuota, adminSetUserRole } from "@/lib/api";
import { parseQuotaInput, quotaModeFor, type QuotaMode } from "@/lib/quota";
import { bytesToGb } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Role, type AdminUser, type PlanConfig } from "@/types";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReauthFields, reauthReady, useUserActionConfirm } from "@/components/admin/reauth-fields";
import { NotifyFields } from "@/components/admin/notify-fields";
import { QuotaFields } from "@/components/admin/quota-fields";
import type { RowAction } from "@/components/admin/data-table";
import { Crown, HardDrive, Mail, Shield, ShieldAlert, Trash2 } from "@/lib/icons";

type Kind = "delete" | "role" | "plan" | "quota";

interface Pending {
  type: Kind;
  detail: string;
  user: AdminUser;
  newValue?: string;
}

const VARIANT = { delete: "danger", role: "warning", plan: "info", quota: "warning" } as const;

/**
 * Every single-user admin action (plan, storage limit, role, delete) with its
 * confirm dialog: re-auth where the server asks for it, the notify toggle, and
 * type-the-username for a delete. Shared by the users table and a user's page.
 */
export function useUserActions({
  currentUserId,
  planConfigs,
  onDone,
  onDeleted,
}: {
  currentUserId: string;
  planConfigs: PlanConfig[];
  onDone: () => void;
  onDeleted?: () => void;
}) {
  const t = useTranslations("admin.userTable");
  const ta = useTranslations("admin.actions");
  const tRoles = useTranslations("admin.roles");
  const router = useRouter();
  const confirm = useUserActionConfirm<Pending>();
  const {
    confirmAction,
    setConfirmAction,
    reauth,
    setReauth,
    notify,
    setNotify,
    needsReauth,
    codeOnly,
  } = confirm;
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState("");
  const [quotaMode, setQuotaMode] = useState<QuotaMode>("default");
  const [quotaInput, setQuotaInput] = useState("");

  const plans = [...planConfigs].sort((a, b) => a.sort_order - b.sort_order);
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;

  const close = () => {
    confirm.closeConfirm();
    setPlan("");
  };

  const start = (type: Kind, user: AdminUser) => {
    const username = user.username;
    if (type === "quota") {
      const mode = quotaModeFor(user.storage_quota ?? null);
      setQuotaMode(mode);
      setQuotaInput(mode === "custom" ? bytesToGb(user.storage_quota as number).toString() : "");
    }
    if (type === "plan") setPlan(user.plan || "free");
    const toAdmin = user.role !== Role.Admin;
    const detail = {
      delete: t("deleteDetail", { username }),
      role: toAdmin ? t("rolePromoteDetail", { username }) : t("roleDemoteDetail", { username }),
      plan: ta("planDetail", { username }),
      quota: t("quotaConfirmDetail", { username }),
    }[type];
    setConfirmAction({
      type,
      user,
      detail,
      newValue: type === "role" ? (toAdmin ? Role.Admin : Role.User) : undefined,
    });
  };

  const run = async () => {
    if (!confirmAction) return;
    const { type, user } = confirmAction;
    let quotaBytes: number | null = null;
    if (type === "quota") {
      const parsed = parseQuotaInput(quotaMode, quotaInput);
      if (!parsed.ok) {
        toast.error(parsed.error);
        return;
      }
      quotaBytes = parsed.bytes;
    }
    setBusy(true);
    try {
      if (type === "delete") {
        await adminDeleteUser(user.id, reauth, notify);
        toast.success(t("userDeleted"), { detail: user.username });
      } else if (type === "role") {
        const role = confirmAction.newValue as Role;
        await adminSetUserRole(user.id, role, reauth, notify);
        toast.success(t("roleUpdated", { role: tRoles(role === Role.Admin ? "admin" : "user") }), {
          detail: ta("signedOutDetail", { username: user.username }),
        });
      } else if (type === "plan") {
        await adminSetUserPlan(user.id, plan, notify);
        toast.success(t("planUpdated", { plan: planName(plan) }), { detail: user.username });
      } else {
        await adminSetUserQuota(user.id, quotaBytes, notify);
        toast.success(t("quotaUpdated"), { detail: user.username });
      }
      close();
      if (type === "delete") onDeleted?.();
      onDone();
    } catch (err) {
      const fallback = {
        delete: "deleteFailed",
        role: "roleFailed",
        plan: "planFailed",
        quota: "quotaFailed",
      }[type];
      toast.error(t(fallback), { detail: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const actionsFor = (u: AdminUser, extra: RowAction[] = []): RowAction[] => {
    const isSelf = u.id === currentUserId;
    return [
      ...extra,
      { label: ta("changePlan"), icon: Crown, onSelect: () => start("plan", u), disabled: isSelf },
      { label: ta("setStorage"), icon: HardDrive, onSelect: () => start("quota", u) },
      {
        label: ta("email"),
        icon: Mail,
        onSelect: () => router.push(`/admin/emails?ids=${u.id}`),
      },
      {
        label: u.role === Role.Admin ? ta("removeAdmin") : ta("makeAdmin"),
        icon: u.role === Role.Admin ? ShieldAlert : Shield,
        onSelect: () => start("role", u),
        disabled: isSelf,
        separatorBefore: true,
      },
      {
        label: ta("delete"),
        icon: Trash2,
        onSelect: () => start("delete", u),
        destructive: true,
        disabled: isSelf,
      },
    ];
  };

  const titles: Record<Kind, string> = {
    delete: t("deleteUser"),
    role: confirmAction?.newValue === Role.Admin ? t("promoteTitle") : t("demoteTitle"),
    plan: ta("planTitle"),
    quota: t("quotaConfirmTitle"),
  };
  const labels: Record<Kind, string> = {
    delete: t("deleteUser"),
    role: confirmAction?.newValue === Role.Admin ? t("promote") : t("demote"),
    plan: t("changePlan"),
    quota: t("saveQuota"),
  };
  const planUnchanged =
    confirmAction?.type === "plan" && plan === (confirmAction.user.plan || "free");

  const dialog = confirmAction ? (
    <ConfirmModal
      open
      onConfirm={run}
      onClose={close}
      title={titles[confirmAction.type]}
      description={confirmAction.detail}
      details={confirmAction.user.username}
      confirmLabel={labels[confirmAction.type]}
      variant={VARIANT[confirmAction.type]}
      loading={busy}
      typeToConfirm={confirmAction.type === "delete" ? confirmAction.user.username : undefined}
      confirmDisabled={(needsReauth && !reauthReady(reauth, codeOnly)) || planUnchanged}
    >
      {confirmAction.type === "plan" && (
        <div className="mx-6 mt-4">
          <Select value={plan} onValueChange={setPlan}>
            <SelectTrigger aria-label={ta("choosePlan")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {confirmAction.type === "quota" && (
        <div className="mx-6 mt-4 flex flex-wrap items-center gap-2">
          <QuotaFields
            mode={quotaMode}
            input={quotaInput}
            onModeChange={setQuotaMode}
            onInputChange={setQuotaInput}
          />
        </div>
      )}
      {needsReauth && <ReauthFields value={reauth} onChange={setReauth} codeOnly={codeOnly} />}
      <NotifyFields value={notify} onChange={setNotify} />
    </ConfirmModal>
  ) : null;

  return { actionsFor, start, dialog, busy };
}
