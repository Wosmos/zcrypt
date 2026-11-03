"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { useQuotaQuery } from "@/store/quota";
import { isTauri } from "@/lib/tauri";
import { cn, formatBytes } from "@/lib/utils";
import {
  desktopAppLead,
  launchDesktopApp,
  openDesktopDownload,
  type DesktopAppLead,
} from "@/lib/open-desktop-app";
import { formatResetDate } from "@/lib/web-transfer-limit";
import { webTransferUsage } from "@/lib/web-transfer-usage";

const subscribeNever = () => () => {};
const serverLead = (): DesktopAppLead => "open";

/**
 * How much of this month's web transfer allowance the user has used: uploads
 * and downloads that go through zcrypt's server. Hidden when there is no limit,
 * which is always the case for admins.
 */
export function WebTransfers() {
  const t = useTranslations("settings.webTransfers");
  const { data } = useQuotaQuery();
  const usage = webTransferUsage(data);
  const lead = useSyncExternalStore(subscribeNever, desktopAppLead, serverLead);
  if (!usage) return null;

  return (
    <div className="space-y-3">
      <div className="px-1">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">{t("title")}</h3>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t("description")}</p>
      </div>
      <div className="space-y-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 px-4 py-3.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm tabular-nums text-[var(--color-text)]">
            {usage.usedUp
              ? t("usedUp", { limit: formatBytes(usage.limit) })
              : t("usage", { used: formatBytes(usage.used), limit: formatBytes(usage.limit) })}
          </p>
          {usage.resetsAt && (
            <p className="text-xs text-[var(--color-text-muted)]">
              {t("resets", { date: formatResetDate(usage.resetsAt) })}
            </p>
          )}
        </div>
        <div
          role="meter"
          aria-label={t("title")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(usage.percent)}
          className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]"
        >
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              usage.nearlyUsed ? "bg-orange-500" : "bg-[var(--color-accent)]",
            )}
            style={{ width: `${usage.percent}%` }}
          />
        </div>
        {!isTauri && (
          <p className="text-xs text-[var(--color-text-muted)]">
            {t("desktopHint")}{" "}
            <button
              type="button"
              onClick={lead === "open" ? () => void launchDesktopApp() : openDesktopDownload}
              className="font-medium text-[var(--color-accent)] hover:underline"
            >
              {t(lead === "open" ? "openDesktop" : "getDesktop")}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
