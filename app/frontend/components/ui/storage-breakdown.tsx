"use client";

import { useTranslations } from "next-intl";
import { formatBytes } from "@/lib/utils";
import { PLATFORM_COLORS, platformName } from "@/lib/platforms";
import type { PlatformUsage } from "@/lib/storage-usage";

const FALLBACK_COLOR = "var(--color-text-muted)";

interface StorageBreakdownProps {
  rows: PlatformUsage[];
  summary: string;
}

export function StorageBreakdown({ rows, summary }: StorageBreakdownProps) {
  const t = useTranslations("shell");
  const stored = rows.filter((r) => r.bytes > 0);
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-[var(--color-text)]">{t("storage")}</p>
        <p className="truncate text-xs tabular-nums text-[var(--color-text-muted)]">{summary}</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">{t("noPlatformConnected")}</p>
      ) : (
        <>
          <div
            className="flex h-2 gap-px overflow-hidden rounded-full bg-[var(--color-surface-3)]"
            aria-hidden="true"
          >
            {stored.map((r) => (
              <span
                key={r.platform}
                className="h-full min-w-[3px]"
                style={{
                  width: `${r.share * 100}%`,
                  backgroundColor: PLATFORM_COLORS[r.platform] ?? FALLBACK_COLOR,
                }}
              />
            ))}
          </div>
          <div className="space-y-0.5">
            <p className="pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-text-muted)]">
              {t("storageByPlatform")}
            </p>
            <ul className="space-y-1.5">
              {rows.map((r) => (
                <li key={r.platform} className="flex items-center gap-2 text-sm">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: PLATFORM_COLORS[r.platform] ?? FALLBACK_COLOR }}
                  />
                  <span className="min-w-0 flex-1 truncate text-[var(--color-text)]">
                    {platformName(r.platform)}
                    {!r.connected && (
                      <span className="ms-1.5 text-xs text-[var(--color-text-muted)]">
                        {t("storageDisconnected")}
                      </span>
                    )}
                  </span>
                  <span className="text-xs tabular-nums text-[var(--color-text-secondary)]">
                    {formatBytes(r.bytes)}
                  </span>
                  <span className="w-9 text-end text-xs tabular-nums text-[var(--color-text-muted)]">
                    {Math.round(r.share * 100)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-[11px] leading-snug text-[var(--color-text-muted)]">
            {t("storageStoredNote")}
          </p>
        </>
      )}
    </div>
  );
}
