"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { formatBytes, formatRelativeTime } from "@/lib/utils";
import { adminGetSendStorage, adminSetSendPlatform } from "@/lib/api";
import { useAdminQuery } from "@/hooks/useAdminGuardedFetch";
import { qk } from "@/lib/query-keys";
import { toast } from "@/store/toast";
import { platformName } from "@/lib/platforms";
import { Database } from "@/lib/icons";
import type { AdminSendStorageResponse } from "@/lib/api";

function SendStorageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-12 w-full" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-12" />
          <Skeleton className="h-6 w-12" />
        </div>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-48 w-full" />
      </div>
    </div>
  );
}

interface SendStorageTableProps {
  data: AdminSendStorageResponse;
}

function SendStorageTable({ data }: SendStorageTableProps) {
  const locations = data.usage.by_location;

  if (locations.length === 0) {
    return (
      <EmptyState
        icon={<Database className="h-6 w-6 text-[var(--color-text-muted)]" />}
        title="No Sends stored right now"
        description="Sends will appear here once anonymous transfers are made."
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)]">
              <th className="text-left py-2 px-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">
                Platform
              </th>
              <th className="text-left py-2 px-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">
                Account
              </th>
              <th className="text-left py-2 px-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">
                Repository
              </th>
              <th className="text-right py-2 px-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">
                Transfers
              </th>
              <th className="text-right py-2 px-3 font-medium text-[var(--color-text-muted)] text-xs uppercase tracking-wider">
                Size
              </th>
            </tr>
          </thead>
          <tbody>
            {locations.map((loc, idx) => (
              <tr
                key={`${loc.platform}-${loc.account}-${loc.repo}`}
                className={idx > 0 ? "border-t border-[var(--color-border)]" : ""}
              >
                <td className="py-3 px-3 text-[var(--color-text)]">{platformName(loc.platform)}</td>
                <td className="py-3 px-3 text-[var(--color-text-secondary)] font-mono text-xs">
                  {loc.account}
                </td>
                <td className="py-3 px-3 text-[var(--color-text-secondary)] font-mono text-xs truncate">
                  {loc.repo}
                </td>
                <td className="py-3 px-3 text-right text-[var(--color-text)]">{loc.transfers}</td>
                <td className="py-3 px-3 text-right text-[var(--color-text)]">
                  {formatBytes(loc.bytes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {locations.map((loc) => (
          <div
            key={`${loc.platform}-${loc.account}-${loc.repo}`}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
                {platformName(loc.platform)}
              </span>
              <span className="text-sm font-semibold text-[var(--color-text)]">
                {formatBytes(loc.bytes)}
              </span>
            </div>
            <div className="text-xs text-[var(--color-text-secondary)] font-mono">
              {loc.account} / {loc.repo}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">
              {loc.transfers} transfer{loc.transfers === 1 ? "" : "s"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AdminSendStorage() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedPlatform, setSelectedPlatform] = useState("");
  const [updating, setUpdating] = useState(false);

  const { data, loading, error, refresh } = useAdminQuery(qk.adminSendStorage, adminGetSendStorage);

  const handlePlatformChange = (platform: string) => {
    setSelectedPlatform(platform);
    setConfirmOpen(true);
  };

  const handleConfirmPlatform = async () => {
    if (!selectedPlatform) return;
    setUpdating(true);
    try {
      await adminSetSendPlatform(selectedPlatform);
      toast.success(`Send platform set to ${platformName(selectedPlatform)}`);
      setConfirmOpen(false);
      setSelectedPlatform("");
      refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to update platform";
      toast.error(msg);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return <SendStorageSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-6 text-center">
        <p className="text-sm text-[var(--color-text-secondary)] mb-4">
          Couldn't load Send storage settings
        </p>
        <Button onClick={refresh} variant="secondary" size="sm">
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const usage = data.usage;
  const limits = data.limits;
  const usagePercent = (usage.bytes / limits.anon_daily_bytes) * 100;

  return (
    <Section
      title="Send Storage"
      description="Where encrypted anonymous transfers are stored"
      className="space-y-6"
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              Usage
            </label>
            <span className="text-sm font-semibold text-[var(--color-text)]">
              {formatBytes(usage.bytes)} / {formatBytes(limits.anon_daily_bytes)}
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-[var(--color-surface-2)] overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)] transition-all duration-500"
              style={{ width: `${Math.min(100, usagePercent)}%` }}
              role="progressbar"
              aria-valuenow={Math.min(100, usagePercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Send storage usage"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {usage.oldest_expires_at && (
            <Badge variant="muted">
              Oldest: {formatRelativeTime(new Date(usage.oldest_expires_at))}
            </Badge>
          )}
          <Badge variant="muted">{usage.transfers} transfers</Badge>
          <Badge variant="muted">{usage.chunks} chunks</Badge>
        </div>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider block">
          Platform
        </label>
        <Select value={data.platform_setting} onValueChange={handlePlatformChange}>
          <SelectTrigger className="bg-[var(--color-surface-1)] border-[var(--color-border)] text-[var(--color-text)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {data.options.map((opt) => (
              <SelectItem key={opt.key} value={opt.platform}>
                {platformName(opt.platform)} ({opt.account})
              </SelectItem>
            ))}
            {data.options.length === 0 && (
              <SelectItem value="" disabled>
                No storage configured
              </SelectItem>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider block">
          Daily Limits
        </label>
        <div className="flex flex-wrap gap-2">
          <Badge variant="accent">{formatBytes(limits.max_file_bytes)} per file</Badge>
          <Badge variant="accent">{formatBytes(limits.anon_daily_bytes)} anon/day</Badge>
          <Badge variant="accent">{formatBytes(limits.user_daily_bytes)} signed-in/day</Badge>
        </div>
      </div>

      <SendStorageTable data={data} />

      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
        <p className="text-xs text-cyan-700 dark:text-cyan-300">
          Sends are encrypted before upload; this is where the ciphertext lives.
        </p>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Change Send platform"
        description={`Switch to ${platformName(selectedPlatform)} for new anonymous transfers?`}
        confirmLabel="Switch platform"
        onConfirm={handleConfirmPlatform}
        loading={updating}
      />
    </Section>
  );
}
