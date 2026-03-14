"use client";

import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { formatBytes, cn } from "@/lib/utils";
import { Database } from "@/lib/icons";

export function StoragePool() {
  const { repos } = usePlatformHealth();

  if (repos.length === 0) {
    return (
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">Storage Pool</h2>
        </div>
        <div className="text-center py-8 px-5">
          <Database className="h-8 w-8 text-[var(--color-text-muted)] mx-auto mb-2" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            No repos yet — auto-created on first upload
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="px-5 py-4 border-b border-[var(--color-border)]">
        <h2 className="text-sm font-semibold">Storage Pool</h2>
      </div>
      <div className="p-5 space-y-2">
        {repos.map((repo) => {
          const usagePercent = Math.min(100, (repo.used_bytes / repo.max_bytes) * 100);
          return (
            <div
              key={repo.id}
              className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] p-4"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{repo.name}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  <span className="capitalize">{repo.platform}</span>
                  {repo.account && <span> @{repo.account}</span>}
                </p>
              </div>

              <div className="text-right hidden sm:block">
                <p className="text-xs text-[var(--color-text-secondary)] tabular-nums">
                  {formatBytes(repo.used_bytes)} / {formatBytes(repo.max_bytes)}
                </p>
                <div className="mt-1.5 h-1.5 w-28 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      repo.active ? "bg-cyan-500" : "bg-[var(--color-text-muted)]"
                    )}
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              </div>

              <span
                className={cn(
                  "text-xs font-medium px-2.5 py-1 rounded-full",
                  repo.active
                    ? "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20"
                    : "bg-[var(--color-surface-1)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                )}
              >
                {repo.active ? "Active" : "Full"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
