"use client";

import { useState } from "react";
import { cancelAccountDeletion } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { AlertTriangle } from "@/lib/icons";
import { formatDateShort } from "@/lib/utils";

export function AccountDeletionBanner() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [keeping, setKeeping] = useState(false);

  if (!user?.deletion_scheduled_at) return null;

  const keep = async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token) return;
    setKeeping(true);
    try {
      await cancelAccountDeletion(token);
      setUser({ ...user, deletion_scheduled_at: undefined });
      toast.success("Your account is no longer scheduled for deletion");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel the deletion");
    } finally {
      setKeeping(false);
    }
  };

  return (
    <div
      role="alert"
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-red-500/20 bg-red-500/[0.06] p-4 sm:mb-6 sm:flex-row sm:items-center"
    >
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-600 ring-1 ring-red-500/20 dark:text-red-400">
        <AlertTriangle className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[var(--color-text)]">
          This account will be deleted on {formatDateShort(user.deletion_scheduled_at)}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          Your files, folders and share links are erased then. Keep the account to stop it.
        </p>
      </div>
      <Button onClick={() => void keep()} disabled={keeping} className="sm:self-center">
        {keeping ? <LogoSpinner size={14} speed="fast" /> : "Keep my account"}
      </Button>
    </div>
  );
}
