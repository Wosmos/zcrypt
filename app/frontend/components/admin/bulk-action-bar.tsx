"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { adminBulkUsers, type AdminBulkAction } from "@/lib/api";
import { parseQuotaInput, type QuotaMode } from "@/lib/quota";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EMPTY_REAUTH, ReauthFields, reauthReady } from "@/components/admin/reauth-fields";
import { DEFAULT_NOTIFY, NotifyFields } from "@/components/admin/notify-fields";
import { QuotaFields } from "@/components/admin/quota-fields";
import { Mail, Trash2 } from "@/lib/icons";
import { BulkBar } from "@/components/admin/data-table";
import type { PlanConfig } from "@/types";

type Pending = "set_plan" | "set_quota" | "promote" | "demote" | "delete";

const FALLBACK_PLANS = [
  { id: "free", name: "Free" },
  { id: "plus", name: "Plus" },
  { id: "pro", name: "Pro" },
];

const REQUEST: Record<
  Pending,
  { action: AdminBulkAction; needsReauth: boolean; codeOnly?: boolean }
> = {
  set_plan: { action: "set_plan", needsReauth: false },
  set_quota: { action: "set_quota", needsReauth: false },
  promote: { action: "set_role", needsReauth: true },
  demote: { action: "set_role", needsReauth: true },
  delete: { action: "delete", needsReauth: true, codeOnly: true },
};

const VARIANT = {
  set_plan: "info",
  set_quota: "warning",
  promote: "warning",
  demote: "warning",
  delete: "danger",
} as const;

/** Sticky bar for acting on the selected users, with one confirm dialog for every action. */
export function BulkActionBar({
  selectedIds,
  currentUserId,
  planConfigs,
  onClear,
  onDone,
}: {
  selectedIds: string[];
  currentUserId: string;
  planConfigs?: PlanConfig[];
  onClear: () => void;
  onDone: (failedIds: string[]) => void;
}) {
  const t = useTranslations("admin.bulk");
  const router = useRouter();
  const [pending, setPending] = useState<Pending | null>(null);
  const [plan, setPlan] = useState("");
  const [quotaMode, setQuotaMode] = useState<QuotaMode>("default");
  const [quotaInput, setQuotaInput] = useState("");
  const [reauth, setReauth] = useState(EMPTY_REAUTH);
  const [notify, setNotify] = useState(DEFAULT_NOTIFY);
  const [loading, setLoading] = useState(false);

  const count = selectedIds.length;
  if (count === 0 && !pending) return null;

  const plans = planConfigs?.length ? planConfigs : FALLBACK_PLANS;
  const includesSelf = selectedIds.includes(currentUserId);
  const planChoice = plan || plans[0].id;
  const needsReauth = pending !== null && REQUEST[pending].needsReauth;
  const codeOnly = pending !== null && REQUEST[pending].codeOnly === true;

  const close = () => {
    setPending(null);
    setReauth(EMPTY_REAUTH);
    setNotify(DEFAULT_NOTIFY);
    setPlan("");
    setQuotaMode("default");
    setQuotaInput("");
  };

  const valueFor = (action: Pending): string | number | null | undefined => {
    if (action === "set_plan") return planChoice;
    if (action === "promote") return "admin";
    if (action === "demote") return "user";
    if (action === "delete") return null;
    const parsed = parseQuotaInput(quotaMode, quotaInput);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return undefined;
    }
    return parsed.bytes;
  };

  const run = async () => {
    if (!pending) return;
    const value = valueFor(pending);
    if (value === undefined) return;
    setLoading(true);
    try {
      const { results } = await adminBulkUsers(
        selectedIds,
        REQUEST[pending].action,
        value,
        notify,
        needsReauth ? reauth : undefined,
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length === 0) {
        toast.success(t("allDone", { count: results.length }));
      } else {
        toast.error(
          t("someFailed", {
            ok: results.length - failed.length,
            failed: failed.length,
            reason: failed[0].error ?? t("failedGeneric"),
          }),
        );
      }
      close();
      onDone(failed.map((r) => r.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("failedGeneric"));
    } finally {
      setLoading(false);
    }
  };

  const copy = pending
    ? {
        set_plan: { title: "planTitle", desc: "planDesc", confirm: "confirmPlan" },
        set_quota: { title: "storageTitle", desc: "storageDesc", confirm: "confirmStorage" },
        promote: { title: "adminTitle", desc: "adminDesc", confirm: "confirmAdmin" },
        demote: {
          title: "removeAdminTitle",
          desc: "removeAdminDesc",
          confirm: "confirmRemoveAdmin",
        },
        delete: { title: "deleteTitle", desc: "deleteDesc", confirm: "confirmDelete" },
      }[pending]
    : null;
  const planName = plans.find((p) => p.id === planChoice)?.name ?? planChoice;

  const roleBlocked = includesSelf ? t("selfBlocked") : undefined;

  return (
    <>
      <BulkBar count={count} onClear={onClear}>
        <Button variant="ghost" size="sm" onClick={() => setPending("set_plan")}>
          {t("changePlan")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setPending("set_quota")}>
          {t("setStorage")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={includesSelf}
          title={roleBlocked}
          onClick={() => setPending("promote")}
        >
          {t("makeAdmin")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={includesSelf}
          title={roleBlocked}
          onClick={() => setPending("demote")}
        >
          {t("removeAdmin")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/admin/emails?ids=${selectedIds.join(",")}`)}
        >
          <Mail className="h-3.5 w-3.5" />
          {t("emailSelected")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={includesSelf}
          title={roleBlocked}
          onClick={() => setPending("delete")}
          className="text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("delete")}
        </Button>
      </BulkBar>

      {pending && copy && (
        <ConfirmModal
          open
          onConfirm={run}
          onClose={close}
          title={t(copy.title, { count })}
          description={t(copy.desc, { count, plan: planName })}
          confirmLabel={t(copy.confirm)}
          variant={VARIANT[pending]}
          loading={loading}
          typeToConfirm={pending === "delete" ? t("deleteWord") : undefined}
          confirmDisabled={needsReauth && !reauthReady(reauth, codeOnly)}
        >
          {pending === "set_plan" && (
            <div className="mx-6 mt-4">
              <Select value={planChoice} onValueChange={setPlan}>
                <SelectTrigger aria-label={t("choosePlan")}>
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
          {pending === "set_quota" && (
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
      )}
    </>
  );
}
