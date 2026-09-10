"use client";

import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { platformName } from "@/lib/platforms";

export interface TokenScopeTarget {
  platform: string;
  username?: string;
  toGlobal: boolean;
}

/**
 * Confirmation for changing a platform token between Local and Global. The
 * backend resolves usable tokens as `user_id = me OR is_global`, so Global
 * routes every user's storage through one account and demoting it strands
 * other users' chunks in that account's repositories — an instance-wide
 * decision, never a bare click. Shared by the user settings and admin pages
 * so the consequences are stated identically in both.
 */
export function TokenScopeConfirm({
  target,
  loading,
  onCancel,
  onConfirm,
}: {
  target: TokenScopeTarget | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open && !loading) onCancel();
      }}
      destructive
      title={
        target?.toGlobal
          ? "Share this account with every user?"
          : "Stop sharing this account with other users?"
      }
      description={
        target ? (
          <div className="space-y-2">
            <p>
              {platformName(target.platform)} account
              {target.username && (
                <>
                  {" "}
                  <span className="font-medium text-[var(--color-text)]">@{target.username}</span>
                </>
              )}
            </p>
            {target.toGlobal ? (
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Every user on this instance will upload to and download from{" "}
                  <span className="font-medium">this</span> account. Its holder can never see what
                  they store — it is encrypted with keys they do not have — but is the account
                  holder of record for it.
                </li>
                <li>
                  Its quota, rate limits, and any enforcement the platform applies are shared with
                  all of them. One user's abuse can get the whole account restricted.
                </li>
                <li>
                  Files stored through it keep depending on it. Making it local again later cuts
                  those users off from their own files.
                </li>
              </ul>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  Other users lose access through this account immediately. Their uploads to it
                  stop.
                </li>
                <li>
                  Any of their files whose chunks live in repositories under this account can no
                  longer be downloaded until it is shared again or the files are re-uploaded
                  elsewhere.
                </li>
                <li>The owner&apos;s own files are not affected.</li>
              </ul>
            )}
          </div>
        ) : (
          ""
        )
      }
      confirmLabel={target?.toGlobal ? "Share with all users" : "Make it local"}
      loading={loading}
      onConfirm={onConfirm}
    />
  );
}
