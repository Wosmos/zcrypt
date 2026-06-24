"use client";

import { useState } from "react";
import { HardDrive } from "@/lib/icons";
import { adminSetDefaultQuota } from "@/lib/api";
import { formatBytes } from "@/lib/utils";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";

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
    <section className="panel overflow-hidden">
      <div className="border-b border-[var(--color-border)] px-5 py-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold tracking-tight text-[var(--color-text)]">
          <HardDrive className="h-4 w-4 text-[var(--color-text-muted)]" />
          Default storage quota
        </h2>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          Applies to users using global platform tokens. Users with personal tokens have unlimited storage.
        </p>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-end gap-3">
          <div className="max-w-xs flex-1">
            <label
              htmlFor="default-quota-gb"
              className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]"
            >
              Quota (GB)
            </label>
            <input
              id="default-quota-gb"
              type="number"
              min="0"
              step="0.5"
              value={quotaGB}
              onChange={(e) => setQuotaGB(e.target.value)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-sm tabular-nums outline-none transition-colors focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
              placeholder="0"
            />
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          Set to 0 for unlimited.
          {defaultQuotaBytes > 0 && (
            <span className="ml-1">
              Current: <span className="font-medium text-[var(--color-text)] tabular-nums">{formatBytes(defaultQuotaBytes)}</span>
            </span>
          )}
        </p>
      </div>
    </section>
  );
}
