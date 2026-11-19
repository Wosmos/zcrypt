"use client";

import { useTranslations } from "next-intl";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { useQuotaQuery } from "@/store/quota";
import { CheckCircle2 as CheckCircle } from "@/lib/icons";
import { cn, formatBytes } from "@/lib/utils";
import { formatResetDate, formatResetTime } from "@/lib/web-transfer-limit";
import { transferAllowance, type AllowanceWindow } from "@/lib/web-transfer-usage";

/** Anchor the low-allowance notice links to. */
export const USAGE_LIMITS_ID = "usage-limits";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 px-4 py-3.5">
      <h4 className="text-[13px] font-semibold text-[var(--color-text)]">{title}</h4>
      {children}
    </div>
  );
}

function Meter({
  label,
  value,
  note,
  percent,
  warn,
}: {
  label: string;
  value: string;
  note?: string;
  percent: number;
  warn?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <p className="text-sm text-[var(--color-text)]">
          <span className="font-medium">{label}</span>
          <span className="ms-2 tabular-nums text-[var(--color-text-secondary)]">{value}</span>
        </p>
        {note && <p className="text-xs text-[var(--color-text-muted)]">{note}</p>}
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(percent)}
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-2)]"
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            warn ? "bg-orange-500" : "bg-[var(--color-accent)]",
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <dt className="text-[var(--color-text-secondary)]">{label}</dt>
      <dd className="tabular-nums text-[var(--color-text)]">{value}</dd>
    </div>
  );
}

/**
 * Usage and limits, for every app: what zcrypt caps and what it does not. Your
 * own storage is never capped; zcrypt's shared storage has a size quota; and
 * what passes through zcrypt's server counts against a daily and a monthly
 * transfer allowance. Admins have no limits.
 */
export function WebTransfers() {
  const t = useTranslations("settings.usageLimits");
  const { data } = useQuotaQuery();
  const { statuses } = usePlatformHealth();
  const allowance = transferAllowance(data);
  const usesShared = statuses.some((s) => s.connected && s.is_global);
  const showShared = !!data && usesShared && data.quota_bytes > 0 && !data.is_unlimited;

  const windowMeter = (w: AllowanceWindow, label: string, reset: string) => (
    <Meter
      label={label}
      value={
        w.usedUp
          ? t("allowance.usedUp", { limit: formatBytes(w.limit) })
          : t("allowance.usage", {
              used: formatBytes(w.used + w.reserved),
              limit: formatBytes(w.limit),
            })
      }
      note={reset}
      percent={w.percent}
      warn={w.nearlyUsed}
    />
  );

  return (
    <section id={USAGE_LIMITS_ID} className="scroll-mt-20 space-y-3">
      <div className="px-1">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">{t("title")}</h3>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t("description")}</p>
      </div>

      <Card title={t("storage.title")}>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {t("storage.own")}
        </p>
        {showShared && data && (
          <Meter
            label={t("storage.shared")}
            value={t("storage.sharedUsage", {
              used: formatBytes(data.used_bytes),
              quota: formatBytes(data.quota_bytes),
            })}
            percent={Math.min(100, (data.used_bytes / data.quota_bytes) * 100)}
            warn={data.used_bytes / data.quota_bytes >= 0.9}
          />
        )}
      </Card>

      <Card title={t("allowance.title")}>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {t("allowance.intro")}
        </p>
        {data && !allowance && (
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
            <CheckCircle
              className="h-4 w-4 flex-none text-[var(--color-accent)]"
              aria-hidden="true"
            />
            {t("allowance.none")}
          </p>
        )}
        {allowance && (
          <div className="space-y-3 pt-1">
            {allowance.daily &&
              windowMeter(
                allowance.daily,
                t("allowance.today"),
                allowance.daily.resetsAt
                  ? t("allowance.resetsAt", { time: formatResetTime(allowance.daily.resetsAt) })
                  : "",
              )}
            {allowance.monthly &&
              windowMeter(
                allowance.monthly,
                t("allowance.month"),
                allowance.monthly.resetsAt
                  ? t("allowance.resetsOn", { date: formatResetDate(allowance.monthly.resetsAt) })
                  : "",
              )}
            <dl className="space-y-1.5 border-t border-[var(--color-border)] pt-3">
              <Fact
                label={t("allowance.perFile")}
                value={
                  allowance.maxFileBytes > 0
                    ? formatBytes(allowance.maxFileBytes)
                    : t("allowance.noFileCap")
                }
              />
              <Fact label={t("allowance.reserved")} value={formatBytes(allowance.reserved)} />
              {allowance.remaining !== null && (
                <Fact label={t("allowance.remaining")} value={formatBytes(allowance.remaining)} />
              )}
            </dl>
          </div>
        )}
      </Card>

      <Card title={t("counts.title")}>
        <div className="space-y-3 text-sm leading-relaxed">
          <div>
            <p className="font-medium text-[var(--color-text)]">{t("counts.yesTitle")}</p>
            <ul className="mt-1 list-disc space-y-1 ps-5 text-[var(--color-text-secondary)]">
              <li>{t("counts.yesTransfers")}</li>
              <li>{t("counts.yesShares")}</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-[var(--color-text)]">{t("counts.noTitle")}</p>
            <p className="mt-1 text-[var(--color-text-secondary)]">{t("counts.noDirect")}</p>
          </div>
        </div>
      </Card>

      <Card title={t("blocked.title")}>
        <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">
          {t("blocked.body")}
        </p>
      </Card>
    </section>
  );
}
