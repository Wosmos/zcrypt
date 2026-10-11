"use client";

import { useEffect } from "react";
import { X } from "@/lib/icons";
import { useSpaceAdds, type SpaceAddJob } from "@/store/space-adds";

const AUTO_DISMISS_MS = 4000;

function label(job: SpaceAddJob): string {
  const files = (n: number) => `${n} file${n === 1 ? "" : "s"}`;
  if (job.status === "done") {
    const ok = job.total - job.failed.length;
    return `Added ${files(ok)} to ${job.vaultName}`;
  }
  if (job.status === "paused") return `Unlock your vault to finish adding to ${job.vaultName}`;
  if (job.status === "error") return `Couldn't finish adding to ${job.vaultName}`;
  if (job.status === "queued") return `Waiting to add ${files(job.total)} to ${job.vaultName}`;
  return `Adding ${job.done} of ${job.total} files to ${job.vaultName}`;
}

export function SpaceAddsStrip() {
  const jobs = useSpaceAdds((s) => s.jobs);
  const retryFailed = useSpaceAdds((s) => s.retryFailed);
  const dismiss = useSpaceAdds((s) => s.dismiss);

  const list = Object.values(jobs);
  const job =
    list.find((j) => j.status === "running") ?? list.find((j) => j.status !== "done") ?? list[0];

  const quietDone = job?.status === "done" && job.failed.length === 0;
  const doneId = quietDone ? job.vaultId : null;
  useEffect(() => {
    if (!doneId) return;
    const t = setTimeout(() => dismiss(doneId), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [doneId, dismiss]);

  if (!job) return null;

  const pct = job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;
  const finished = job.status === "done" || job.status === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+var(--safe-bottom))] z-40 flex justify-center px-3 md:bottom-4"
    >
      <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
        <div className="flex items-center gap-3 px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--color-text)]">{label(job)}</p>
            {job.failed.length > 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">{job.failed.length} failed</p>
            )}
          </div>
          {job.failed.length > 0 && job.status !== "running" && (
            <button
              type="button"
              onClick={() => retryFailed(job.vaultId)}
              className="flex-shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/10"
            >
              Retry
            </button>
          )}
          {finished && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(job.vaultId)}
              className="flex-shrink-0 rounded-lg p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="h-1 w-full bg-[var(--color-surface-1)]">
          <div
            className="h-full bg-[var(--color-accent)] transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function SpaceAddsGuard() {
  const active = useSpaceAdds((s) => Object.values(s.jobs).some((j) => j.status === "running"));

  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);

  return null;
}
