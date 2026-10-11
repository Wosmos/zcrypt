"use client";

import { useTranslations } from "next-intl";
import { formatBytes } from "@/lib/utils";
import type { RepoInfo } from "@/types";
import { AlertTriangle, CheckCircle2 } from "@/lib/icons";
import { platformName } from "@/lib/platforms";

/**
 * Plain-language storage health: flags repos approaching their platform limit.
 * zcrypt rotates to a fresh repo automatically when one fills up, so this is
 * informational, not an action the user has to take. Fill % is derived from
 * each repo's used_bytes / max_bytes (max_bytes = the platform threshold).
 */
export function StorageHealth({ repos }: { repos: RepoInfo[] }) {
  const t = useTranslations("app.analytics.health");
  const ranked = repos
    .map((r) => ({
      ...r,
      pct: r.max_bytes > 0 ? Math.min(100, (r.used_bytes / r.max_bytes) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct);

  const flagged = ranked.filter((r) => r.pct >= 80);
  const top = ranked[0];

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
        <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
          {t("title")}
        </h3>
        <span className="text-xs text-[var(--color-text-muted)]">{t("rotates")}</span>
      </div>

      <div className="space-y-3 p-5">
        {ranked.length === 0 ? (
          <p className="py-4 text-center text-sm text-[var(--color-text-muted)]">{t("none")}</p>
        ) : flagged.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-emerald-500" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              {t("allHealthy")}{" "}
              {top &&
                t.rich("mostUsed", {
                  percent: Math.round(top.pct),
                  b: (chunks) => (
                    <span className="font-medium text-[var(--color-text)]">{chunks}</span>
                  ),
                })}
            </p>
          </div>
        ) : (
          flagged.map((r) => {
            const danger = r.pct >= 95;
            const accent = danger ? "#ef4444" : "#f59e0b";
            return (
              <div key={r.id} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <AlertTriangle
                      className="h-3.5 w-3.5 flex-shrink-0"
                      style={{ color: accent }}
                    />
                    <span className="truncate text-sm font-medium text-[var(--color-text)]">
                      {platformName(r.platform)}
                      {r.account ? ` · ${r.account}` : ""}
                    </span>
                  </div>
                  <span className="flex-shrink-0 text-xs tabular-nums text-[var(--color-text-secondary)]">
                    {Math.round(r.pct)}%
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${r.pct}%`, backgroundColor: accent }}
                  />
                </div>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {danger ? t("nearlyFull") : t("fillingUp")} {formatBytes(r.used_bytes)} /{" "}
                  {formatBytes(r.max_bytes)}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
