"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
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
 * other users' chunks in that account's repositories: an instance-wide
 * decision, never a bare click. Shared by the user settings and admin pages
 * so the consequences are stated identically in both.
 */
export function TokenScopeConfirm({
  target,
  loading,
  onCancel,
  onConfirm,
  confirmDisabled,
  children,
}: {
  target: TokenScopeTarget | null;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  children?: ReactNode;
}) {
  const t = useTranslations("settings.tokenScope");
  return (
    <ConfirmDialog
      open={!!target}
      onOpenChange={(open) => {
        if (!open && !loading) onCancel();
      }}
      destructive
      title={target?.toGlobal ? t("shareTitle") : t("unshareTitle")}
      description={
        target ? (
          <div className="space-y-2">
            <p>
              {t("accountLabel", { platform: platformName(target.platform) })}
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
                  {t.rich("shareReach", {
                    b: (chunks) => <span className="font-medium">{chunks}</span>,
                  })}
                </li>
                <li>{t("shareQuota")}</li>
                <li>{t("shareDependence")}</li>
              </ul>
            ) : (
              <ul className="list-disc space-y-1 pl-5">
                <li>{t("unshareAccess")}</li>
                <li>{t("unshareFiles")}</li>
                <li>{t("unshareOwner")}</li>
              </ul>
            )}
          </div>
        ) : (
          ""
        )
      }
      confirmLabel={target?.toGlobal ? t("shareConfirm") : t("unshareConfirm")}
      loading={loading}
      confirmDisabled={confirmDisabled}
      onConfirm={onConfirm}
    >
      {children}
    </ConfirmDialog>
  );
}
