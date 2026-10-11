"use client";

import { useTranslations } from "next-intl";
import { formatBytes } from "@/lib/utils";
import { platformName } from "@/lib/platforms";
import type { RepoInfo, QuotaInfo } from "@/types";
import type { AnalyticsSummary } from "@/lib/api";

// Per-repo platform limits (mirrors the backend defaults in cmd/server.go).
// These are zcrypt's auto-rotation thresholds (when the repo pool spins up a new
// repo/channel), NOT the platforms' own hard caps. Telegram in particular has
// no storage limit, so its value is a virtual housekeeping threshold.
const PLATFORM_THRESHOLDS: { platform: string; limit: string; unit: "repo" | "channel" }[] = [
  { platform: "GitHub", limit: "850 MB", unit: "repo" },
  { platform: "GitLab", limit: "9 GB", unit: "repo" },
  { platform: "Hugging Face", limit: "280 GB", unit: "repo" },
  { platform: "Telegram", limit: "~50 GB", unit: "channel" },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-sm">
      <span className="text-[var(--color-text-muted)]">{label}</span>
      <span className="tabular-nums text-[var(--color-text)]">{value}</span>
    </div>
  );
}

/**
 * Technical breakdown revealed by the "Advanced" toggle on the Insights page:
 * raw encryption/compression byte totals, the per-repo storage pool, and the
 * platform thresholds. All derived from real file/repo/quota data.
 */
export function AdvancedDetails({
  summary,
  repos,
  quotaInfo,
}: {
  summary: AnalyticsSummary | null;
  repos: RepoInfo[];
  quotaInfo: QuotaInfo | null;
}) {
  const t = useTranslations("app.analytics.advanced");
  const original = summary?.original_bytes ?? 0;
  const compressed = summary?.compressed_bytes ?? 0;
  const encrypted = summary?.encrypted_bytes ?? 0;
  const chunks = summary?.chunk_count ?? 0;
  const fileCount = summary?.file_count ?? 0;
  const avgChunk = chunks > 0 ? encrypted / chunks : 0;
  const avgFile = fileCount > 0 ? original / fileCount : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Encryption & compression internals */}
        <div className="panel overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
              {t("encCompTitle")}
            </h3>
          </div>
          <div className="divide-y divide-[var(--color-border)] px-5 py-2">
            <Row label={t("originalSize")} value={formatBytes(original)} />
            <Row label={t("afterCompression")} value={formatBytes(compressed)} />
            <Row label={t("afterEncryption")} value={formatBytes(encrypted)} />
            <Row label={t("totalChunks")} value={chunks.toLocaleString()} />
            <Row label={t("avgChunk")} value={formatBytes(avgChunk)} />
            <Row label={t("avgFile")} value={formatBytes(avgFile)} />
          </div>
        </div>

        {/* Account / quota internals */}
        <div className="panel overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
              {t("accountTitle")}
            </h3>
          </div>
          <div className="divide-y divide-[var(--color-border)] px-5 py-2">
            <Row label={t("plan")} value={quotaInfo?.plan ? quotaInfo.plan : "-"} />
            <Row label={t("storageUsed")} value={formatBytes(quotaInfo?.used_bytes ?? encrypted)} />
            <Row
              label={t("storageQuota")}
              value={
                quotaInfo?.is_unlimited || !quotaInfo?.quota_bytes
                  ? t("unlimited")
                  : formatBytes(quotaInfo.quota_bytes)
              }
            />
            <Row
              label={t("maxConcurrent")}
              value={
                quotaInfo?.max_concurrent_uploads
                  ? String(quotaInfo.max_concurrent_uploads)
                  : t("unlimited")
              }
            />
            <Row
              label={t("maxFileSize")}
              value={
                quotaInfo?.max_file_size ? formatBytes(quotaInfo.max_file_size) : t("unlimited")
              }
            />
            <Row label={t("byos")} value={quotaInfo?.allows_byob ? t("yes") : t("no")} />
          </div>
        </div>
      </div>

      {/* Per-repo storage pool */}
      <div className="panel overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
            {t("poolTitle", { count: repos.length })}
          </h3>
        </div>
        <div className="overflow-x-auto">
          {repos.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-[var(--color-text-muted)]">
              {t("noRepos")}
            </p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="px-5 py-2.5 font-medium">{t("colPlatform")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("colAccount")}</th>
                  <th className="px-3 py-2.5 font-medium">{t("colRepository")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("colUsed")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("colLimit")}</th>
                  <th className="px-3 py-2.5 text-right font-medium">{t("colFill")}</th>
                  <th className="px-5 py-2.5 text-right font-medium">{t("colStatus")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {repos.map((r) => {
                  const pct =
                    r.max_bytes > 0 ? Math.min(100, (r.used_bytes / r.max_bytes) * 100) : 0;
                  return (
                    <tr key={r.id} className="text-[var(--color-text-secondary)]">
                      <td className="px-5 py-2.5 text-[var(--color-text)]">
                        {platformName(r.platform)}
                      </td>
                      <td className="px-3 py-2.5">{r.account || "-"}</td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 font-mono text-xs">
                        {r.name}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatBytes(r.used_bytes)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {formatBytes(r.max_bytes)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(pct)}%</td>
                      <td className="px-5 py-2.5 text-right">
                        <span
                          className={
                            r.active
                              ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                              : "rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]"
                          }
                        >
                          {r.active ? t("active") : t("rotated")}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Platform thresholds reference */}
      <div className="panel overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
            {t("thresholdsTitle")}
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
          {PLATFORM_THRESHOLDS.map((p) => (
            <div key={p.platform} className="bg-[var(--color-surface)] px-5 py-4">
              <p className="text-sm font-medium text-[var(--color-text)]">{p.platform}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                {t(p.unit === "repo" ? "perRepo" : "perChannelVirtual", { limit: p.limit })}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
