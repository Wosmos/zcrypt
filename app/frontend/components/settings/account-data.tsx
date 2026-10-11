"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { deleteAccount, exportAccount } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { SettingGroup, ValueRow } from "@/components/settings/settings-primitives";
import { AlertTriangle, Download, Key, Shield, Trash2 } from "@/lib/icons";
import { formatDateShort, saveBlob } from "@/lib/utils";

const GRACE_DAYS = 7;

export function AccountData() {
  const t = useTranslations("settings.accountData");
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsCode = !!user?.totp_enabled;
  const ready = password !== "" && (!needsCode || code.trim().length >= 6);

  const handleExport = async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token) return;
    setExporting(true);
    try {
      const data = await exportAccount(token);
      saveBlob(
        `zcrypt-account-${new Date().toISOString().split("T")[0]}.json`,
        JSON.stringify(data, null, 2),
        "application/json",
      );
      toast.success(t("downloaded"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("exportFailed"));
    } finally {
      setExporting(false);
    }
  };

  const closeDialog = (next: boolean) => {
    if (deleting) return;
    setOpen(next);
    if (!next) {
      setPassword("");
      setCode("");
      setError(null);
    }
  };

  const handleDelete = async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token || !ready) return;
    setDeleting(true);
    setError(null);
    try {
      const { deletion_scheduled_at } = await deleteAccount(token, password, code.trim());
      toast.success(t("scheduled", { date: formatDateShort(deletion_scheduled_at) }));
      clearAuth();
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("deleteFailed"));
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingGroup label={t("label")} footnote={t("footnote")}>
        <ValueRow
          icon={<Download className="h-4 w-4" />}
          title={t("download")}
          subtitle={t("downloadDesc")}
          trailing={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? <LogoSpinner size={12} speed="fast" /> : t("downloadButton")}
            </Button>
          }
        />
      </SettingGroup>

      <div className="space-y-2">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
          {t("dangerZone")}
        </h2>
        <div className="flex flex-col gap-4 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4 sm:flex-row sm:items-center">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 ring-1 ring-red-500/20 dark:text-red-400">
            <Trash2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--color-text)]">{t("deleteTitle")}</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {t("deleteDesc", { days: GRACE_DAYS })}
            </p>
          </div>
          <Button variant="danger" onClick={() => setOpen(true)} className="sm:self-center">
            {t("deleteTitle")}
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="max-w-md rounded-2xl border-[var(--color-border)] bg-[var(--color-surface)]">
          <DialogHeader>
            <DialogTitle>{t("dialogTitle")}</DialogTitle>
            <DialogDescription>{t("dialogDesc", { days: GRACE_DAYS })}</DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/50 p-3 text-xs text-[var(--color-text-secondary)]">
            <li className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
              {t("warnChunks")}
            </li>
            <li className="flex gap-2">
              <Shield className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]" />
              {t("warnExport")}
            </li>
          </ul>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
          >
            <Input
              label={t("password")}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Key className="h-4 w-4" />}
              autoFocus
            />
            {needsCode && (
              <Input
                label={t("code")}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                maxLength={12}
              />
            )}
            <p className="text-[11px] text-[var(--color-text-muted)]">{t("oauthHint")}</p>
            {error && (
              <p role="alert" className="text-xs text-[var(--toast-error)]">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => closeDialog(false)}
                disabled={deleting}
              >
                {t("cancel")}
              </Button>
              <Button type="submit" variant="danger" disabled={!ready || deleting}>
                {deleting ? <LogoSpinner size={14} speed="fast" /> : t("confirmDelete")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
