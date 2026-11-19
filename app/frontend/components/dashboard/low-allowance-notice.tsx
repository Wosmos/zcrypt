"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Banner } from "@/components/ui/banner";
import { AlertTriangle } from "@/lib/icons";
import { formatBytes } from "@/lib/utils";
import { formatResetDate, formatResetTime } from "@/lib/web-transfer-limit";
import { lowestWindow } from "@/lib/web-transfer-usage";
import { useQuotaQuery } from "@/store/quota";

export const USAGE_LIMITS_HREF = "/settings?tab=storage#usage-limits";

function dismissKey(kind: string, resetsAt: string | undefined): string {
  return `zcrypt:low-allowance-dismissed:${kind}:${resetsAt ?? ""}`;
}

function wasDismissed(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

/**
 * A small heads-up above the vault once less than a tenth of the daily or the
 * monthly transfer allowance is left, linking to the usage section. Dismissing
 * it hides it until that window resets. Accounts with no limits never see it.
 */
export function LowAllowanceNotice() {
  const t = useTranslations("app.lowAllowance");
  const { data } = useQuotaQuery();
  const [hidden, setHidden] = useState<string | null>(null);
  const low = lowestWindow(data);
  if (!low) return null;
  const key = dismissKey(low.kind, low.resetsAt);
  if (hidden === key || wasDismissed(key)) return null;

  const remaining = formatBytes(low.remaining);
  const body =
    low.kind === "daily"
      ? low.resetsAt
        ? t("bodyDaily", { remaining, time: formatResetTime(low.resetsAt) })
        : t("bodyDailyNoTime", { remaining })
      : low.resetsAt
        ? t("bodyMonthly", { remaining, date: formatResetDate(low.resetsAt) })
        : t("bodyMonthlyNoDate", { remaining });

  return (
    <Banner
      kind="warning"
      icon={AlertTriangle}
      title={t("title")}
      body={body}
      actions={[{ label: t("seeUsage"), href: USAGE_LIMITS_HREF, variant: "outline" }]}
      onDismiss={() => {
        setHidden(key);
        try {
          sessionStorage.setItem(key, "1");
        } catch {
          // Without storage it only comes back on the next page load.
        }
      }}
      className="mb-4"
    />
  );
}
