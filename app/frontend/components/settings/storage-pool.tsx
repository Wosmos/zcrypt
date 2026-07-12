"use client";

import { useState } from "react";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { formatBytes, cn, chunk, smartGridColCount } from "@/lib/utils";
import { Database } from "@/lib/icons";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";

const PAGE_SIZE = 6;

export function StoragePool() {
  const { repos } = usePlatformHealth();
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(repos.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRepos = repos.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
          <div className="space-y-4">
            <div className="flex flex-col gap-3">
              {chunk(pageRepos, smartGridColCount(pageRepos.length)).map((row, i) => (
                <div key={i} className="flex flex-col gap-3 sm:flex-row">
                  {row.map((repo) => {
                    const usagePercent = Math.min(100, (repo.used_bytes / repo.max_bytes) * 100);
                    return (
                      <div
                        key={repo.id}
                        className="flex min-w-0 items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-4 sm:flex-1"
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
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              onPageChange={setPage}
              totalItems={repos.length}
              pageSize={PAGE_SIZE}
            />
          </div>
        )}
      </Section>
    </div>
  );
}
