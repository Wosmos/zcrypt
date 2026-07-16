"use client";

import { useState } from "react";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { formatBytes, cn } from "@/lib/utils";
import { Database } from "@/lib/icons";
import { PlatformIcon } from "@/components/icons/platform-icon";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 6;

/**
 * The user's storage repositories, as a flat native list (divided rows in one
 * container — no card-per-repo). Rendered inside the Settings "Storage &
 * quotas" pane, so it carries a light sub-header rather than its own panel.
 */
export function StoragePool() {
  const { repos } = usePlatformHealth();
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(repos.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRepos = repos.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="px-1">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Storage pool</h3>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
          Repositories zcrypt manages — auto-created and rotated as they fill up.
        </p>
      </div>

      {repos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center">
          <Database className="mx-auto mb-2 h-7 w-7 text-[var(--color-text-muted)]" />
          <p className="text-sm text-[var(--color-text-secondary)]">No repos yet</p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">Auto-created on your first upload.</p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 divide-y divide-[var(--color-border)]">
            {pageRepos.map((repo) => {
              const usagePercent = Math.min(100, (repo.used_bytes / repo.max_bytes) * 100);
              return (
                <div key={repo.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface)] ring-1 ring-[var(--color-border)]">
                    <PlatformIcon platform={repo.platform} className="h-4 w-4" />
                  </span>
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

                  <span
                    className={cn(
                      "flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                      repo.active
                        ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                        : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                    )}
                  >
                    {repo.active ? "Active" : "Full"}
                  </span>
                </div>
              );
            })}
          </div>

          <Pagination
            currentPage={safePage}
            totalPages={totalPages}
            onPageChange={setPage}
            totalItems={repos.length}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}
