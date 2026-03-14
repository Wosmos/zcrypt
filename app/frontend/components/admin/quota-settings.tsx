"use client";

import { useState } from "react";
import { HardDrive } from "@/lib/icons";
import { adminSetDefaultQuota } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { toast } from "@/store/toast";

export function QuotaSettings({
  defaultQuotaBytes,
  onRefresh,
}: {
  defaultQuotaBytes: number;
  onRefresh: () => void;
}) {
  const [quotaGB, setQuotaGB] = useState<string>(
    defaultQuotaBytes > 0 ? (defaultQuotaBytes / (1024 * 1024 * 1024)).toString() : "0"
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const gb = parseFloat(quotaGB);
    if (isNaN(gb) || gb < 0) {
      toast.error("Invalid quota value");
      return;
    }

    setSaving(true);
    try {
      const bytes = Math.round(gb * 1024 * 1024 * 1024);
      await adminSetDefaultQuota(bytes);
      toast.success(bytes > 0 ? `Default quota set to ${formatBytes(bytes)}` : "Default quota set to unlimited");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update quota");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card">
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-[var(--color-text-muted)]" />
          Default Storage Quota
        </h2>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Applies to users using global platform tokens. Users with personal tokens have unlimited storage.
        </p>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-end gap-3">
          <div className="flex-1 max-w-xs">
            <label className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider font-medium block mb-1.5">
              Quota (GB)
            </label>
            <input
              type="number"
              min="0"
              step="0.5"
              value={quotaGB}
              onChange={(e) => setQuotaGB(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[var(--color-surface-1)] border border-[var(--color-border)] text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-cyan-500/30 focus:border-cyan-500/50"
              placeholder="0"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
        <p className="text-xs text-[var(--color-text-muted)] mt-2">
          Set to 0 for unlimited.
          {defaultQuotaBytes > 0 && (
            <span className="ml-1">
              Current: <span className="font-medium text-[var(--color-text)]">{formatBytes(defaultQuotaBytes)}</span>
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
