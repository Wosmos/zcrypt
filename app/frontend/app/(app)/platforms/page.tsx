"use client";

import { PlatformCard } from "@/components/platforms/platform-card";
import { usePlatformHealth } from "@/hooks/usePlatformHealth";
import { formatBytes } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { Database, Server } from "lucide-react";

export default function PlatformsPage() {
  const { statuses, repos, loading } = usePlatformHealth();

  return (
    <div className="space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Platforms
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Connection status and repository pool health
        </p>
      </div>

      {/* Platform Status */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Connections
        </h2>
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-[var(--color-border)] border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : statuses.length === 0 ? (
          <div className="text-center py-8">
            <Server className="h-8 w-8 text-[var(--color-text-muted)] mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              No platforms configured yet
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {statuses.map((s) => (
              <PlatformCard
                key={s.platform + ":" + (s.account ?? s.username ?? "")}
                status={s}
              />
            ))}
          </div>
        )}
      </section>

      {/* Repo Pool */}
      <section className="space-y-3">
        <h2 className="text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          Repository Pool
        </h2>
        {repos.length === 0 ? (
          <div className="text-center py-8">
            <Database className="h-8 w-8 text-[var(--color-text-muted)] mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              No repos yet — auto-created on first upload
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {repos.map((repo) => {
              const usagePercent = Math.min(
                100,
                (repo.used_bytes / repo.max_bytes) * 100
              );
              return (
                <div
                  key={repo.id}
                  className="flex items-center gap-4 card-hover p-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {repo.name}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      <span className="capitalize">{repo.platform}</span>
                      {repo.account && (
                        <span className="text-[var(--color-text-muted)]">
                          {" "}
                          @{repo.account}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="text-right hidden sm:block">
                    <p className="text-xs text-[var(--color-text-secondary)] tabular-nums">
                      {formatBytes(repo.used_bytes)} /{" "}
                      {formatBytes(repo.max_bytes)}
                    </p>
                    <div className="mt-1.5 h-1.5 w-28 rounded-full bg-[var(--color-surface-2)] overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          repo.active ? "bg-emerald-500" : "bg-[var(--color-text-muted)]"
                        )}
                        style={{ width: `${usagePercent}%` }}
                      />
                    </div>
                  </div>

                  <span
                    className={cn(
                      "text-[11px] font-medium px-2.5 py-1 rounded-full",
                      repo.active
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        : "bg-[var(--color-surface-1)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                    )}
                  >
                    {repo.active ? "Active" : "Full"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
