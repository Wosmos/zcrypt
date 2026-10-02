"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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
import { formatDateShort } from "@/lib/utils";

const GRACE_DAYS = 7;

function saveJSON(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function AccountData() {
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
      saveJSON(data, `zcrypt-account-${new Date().toISOString().split("T")[0]}.json`);
      toast.success("Account data downloaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not export your data");
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
      toast.success(
        `Account scheduled for deletion on ${formatDateShort(deletion_scheduled_at)}. Sign in before then to keep it.`,
      );
      clearAuth();
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete your account");
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <SettingGroup
        label="Your data"
        footnote="File contents never pass through zcrypt unencrypted, so they are not in this export: they stay in your storage, readable only with your vault passphrase."
      >
        <ValueRow
          icon={<Download className="h-4 w-4" />}
          title="Download account data"
          subtitle="Profile, devices, file and folder records, share links and security history as JSON"
          trailing={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleExport()}
              disabled={exporting}
            >
              {exporting ? <LogoSpinner size={12} speed="fast" /> : "Download"}
            </Button>
          }
        />
      </SettingGroup>

      <div className="space-y-2">
        <h2 className="px-1 text-[11px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
          Danger zone
        </h2>
        <div className="flex flex-col gap-4 rounded-2xl border border-red-500/20 bg-red-500/[0.04] p-4 sm:flex-row sm:items-center">
          <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 ring-1 ring-red-500/20 dark:text-red-400">
            <Trash2 className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--color-text)]">Delete account</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Signs you out everywhere, then erases your account, files, folders and share links
              after {GRACE_DAYS} days. Sign back in before then to change your mind.
            </p>
          </div>
          <Button variant="danger" onClick={() => setOpen(true)} className="sm:self-center">
            Delete account
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={closeDialog}>
        <DialogContent className="max-w-md rounded-2xl border-[var(--color-border)] bg-[var(--color-surface)]">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              Confirm it is you. Every device is signed out now and everything is erased in{" "}
              {GRACE_DAYS} days unless you sign back in and keep the account.
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/50 p-3 text-xs text-[var(--color-text-secondary)]">
            <li className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
              Encrypted chunks on zcrypt-managed storage are deleted. Your own connected storage is
              left for you to clean up.
            </li>
            <li className="flex gap-2">
              <Shield className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)]" />
              Download your account data first if you want a record of it.
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
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              icon={<Key className="h-4 w-4" />}
              autoFocus
            />
            {needsCode && (
              <Input
                label="2FA code"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                maxLength={12}
              />
            )}
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Only ever signed in with Google or GitHub? Set a password first with "Forgot password"
              on the sign-in page.
            </p>
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
                Cancel
              </Button>
              <Button type="submit" variant="danger" disabled={!ready || deleting}>
                {deleting ? <LogoSpinner size={14} speed="fast" /> : "Delete my account"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
