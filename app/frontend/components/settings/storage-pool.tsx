"use client";

import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { formatBytes, cn } from "@/lib/utils";
import { Database } from "@/lib/icons";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";

export function StoragePool() {
  const { repos } = usePlatformHealth();

  return (
    <div className="panel p-6">
      <Section
        title="Storage pool"
        description="Repositories zcrypt manages. New repos are auto-created and rotated as they fill up."
      >
        {repos.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center">
            <Database className="mx-auto mb-2 h-7 w-7 text-[var(--color-text-muted)]" />
            <p className="text-sm text-[var(--color-text-secondary)]">No repos yet</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Auto-created on your first upload.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {repos.map((repo) => {
              const usagePercent = Math.min(100, (repo.used_bytes / repo.max_bytes) * 100);
              return (
                <li
                  key={repo.id}
                  className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">{repo.name}</p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">
                      <span className="capitalize">{repo.platform}</span>
                      {repo.account && <span> @{repo.account}</span>}
                    </p>
                  </div>

                  <div className="hidden text-right sm:block">
                    <p className="text-xs tabular-nums text-[var(--color-text-secondary)]">
                      {formatBytes(repo.used_bytes)} / {formatBytes(repo.max_bytes)}
                    </p>
                    <div className="mt-1.5 h-1.5 w-28 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          repo.active ? "bg-[var(--color-accent)]" : "bg-[var(--color-text-muted)]"
                        )}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>

                  <Badge
                    variant="outline"
                    className={cn(
                      "flex-shrink-0",
                      repo.active
                        ? "border-[var(--color-accent)]/20 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface-1)] text-[var(--color-text-muted)]"
                    )}
                  >
                    {repo.active ? "Active" : "Full"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
