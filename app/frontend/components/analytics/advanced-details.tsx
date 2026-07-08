"use client";

import { formatBytes } from "@/lib/utils";
import { platformName } from "@/lib/platforms";
import type { FileMetadata, RepoInfo, QuotaInfo } from "@/types";

// Per-repo platform limits (mirrors the backend defaults in cmd/server.go).
// These are zcrypt's auto-rotation thresholds (when the repo pool spins up a new
// repo/channel), NOT the platforms' own hard caps — Telegram in particular has
// no storage limit, so its value is a virtual housekeeping threshold.
const PLATFORM_THRESHOLDS: { platform: string; limit: string }[] = [
  { platform: "GitHub", limit: "850 MB / repo" },
  { platform: "GitLab", limit: "9 GB / repo" },
  { platform: "Hugging Face", limit: "280 GB / repo" },
  { platform: "Telegram", limit: "~50 GB / channel (virtual)" },
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
  files,
  repos,
  quotaInfo,
}: {
  files: FileMetadata[];
  repos: RepoInfo[];
  quotaInfo: QuotaInfo | null;
}) {
  const original = files.reduce((s, f) => s + f.original_size, 0);
  const compressed = files.reduce((s, f) => s + f.compressed_size, 0);
  const encrypted = files.reduce((s, f) => s + f.encrypted_size, 0);
  const chunks = files.reduce((s, f) => s + f.chunk_count, 0);
  const avgChunk = chunks > 0 ? encrypted / chunks : 0;
  const avgFile = files.length > 0 ? original / files.length : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Encryption & compression internals */}
        <div className="panel overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
              Encryption &amp; compression
            </h3>
          </div>
          <div className="divide-y divide-[var(--color-border)] px-5 py-2">
            <Row label="Original size" value={formatBytes(original)} />
            <Row label="After compression" value={formatBytes(compressed)} />
            <Row label="After encryption (stored)" value={formatBytes(encrypted)} />
            <Row label="Total chunks" value={chunks.toLocaleString()} />
            <Row label="Average chunk size" value={formatBytes(avgChunk)} />
            <Row label="Average file size" value={formatBytes(avgFile)} />
          </div>
        </div>

        {/* Account / quota internals */}
        <div className="panel overflow-hidden">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
              Account
            </h3>
          </div>
          <div className="divide-y divide-[var(--color-border)] px-5 py-2">
            <Row label="Plan" value={quotaInfo?.plan ? quotaInfo.plan : "—"} />
            <Row label="Storage used" value={formatBytes(quotaInfo?.used_bytes ?? encrypted)} />
            <Row
              label="Storage quota"
              value={quotaInfo?.is_unlimited || !quotaInfo?.quota_bytes ? "Unlimited" : formatBytes(quotaInfo.quota_bytes)}
            />
            <Row
              label="Max concurrent uploads"
              value={quotaInfo?.max_concurrent_uploads ? String(quotaInfo.max_concurrent_uploads) : "Unlimited"}
            />
            <Row
              label="Max file size"
              value={quotaInfo?.max_file_size ? formatBytes(quotaInfo.max_file_size) : "Unlimited"}
            />
            <Row label="Bring your own storage" value={quotaInfo?.allows_byob ? "Yes" : "No"} />
          </div>
        </div>
      </div>

      {/* Per-repo storage pool */}
      <div className="panel overflow-hidden">
        <div className="border-b border-[var(--color-border)] px-5 py-4">
          <h3 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">
            Storage pool ({repos.length} {repos.length === 1 ? "repository" : "repositories"})
          </h3>
        </div>
        <div className="overflow-x-auto">
          {repos.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-[var(--color-text-muted)]">
              No repositories provisioned yet.
            </p>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-text-muted)]">
                  <th className="px-5 py-2.5 font-medium">Platform</th>
                  <th className="px-3 py-2.5 font-medium">Account</th>
                  <th className="px-3 py-2.5 font-medium">Repository</th>
                  <th className="px-3 py-2.5 text-right font-medium">Used</th>
                  <th className="px-3 py-2.5 text-right font-medium">Limit</th>
                  <th className="px-3 py-2.5 text-right font-medium">Fill</th>
                  <th className="px-5 py-2.5 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {repos.map((r) => {
                  const pct = r.max_bytes > 0 ? Math.min(100, (r.used_bytes / r.max_bytes) * 100) : 0;
                  return (
                    <tr key={r.id} className="text-[var(--color-text-secondary)]">
                      <td className="px-5 py-2.5 text-[var(--color-text)]">
                        {platformName(r.platform)}
                      </td>
                      <td className="px-3 py-2.5">{r.account || "—"}</td>
                      <td className="max-w-[180px] truncate px-3 py-2.5 font-mono text-xs">{r.name}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatBytes(r.used_bytes)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{formatBytes(r.max_bytes)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(pct)}%</td>
                      <td className="px-5 py-2.5 text-right">
                        <span
                          className={
                            r.active
                              ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                              : "rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-muted)]"
                          }
                        >
                          {r.active ? "Active" : "Rotated"}
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
            Repo rotation thresholds
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-px bg-[var(--color-border)] sm:grid-cols-4">
          {PLATFORM_THRESHOLDS.map((t) => (
            <div key={t.platform} className="bg-[var(--color-surface)] px-5 py-4">
              <p className="text-sm font-medium text-[var(--color-text)]">{t.platform}</p>
              <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t.limit}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
