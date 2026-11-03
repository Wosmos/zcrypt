"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { X } from "@/lib/icons";
import { useSpaceAdds, type SpaceAddJob } from "@/store/space-adds";
import { SpaceAddStatus } from "@/types";

const AUTO_DISMISS_MS = 4000;

type Translate = (key: string, values?: Record<string, string | number>) => string;

function label(job: SpaceAddJob, t: Translate): string {
  const name = job.vaultName;
  if (job.status === SpaceAddStatus.Done) {
    return t("strip.done", { count: job.total - job.failed.length, name });
  }
  if (job.status === SpaceAddStatus.Paused) return t("strip.paused", { name });
  if (job.status === SpaceAddStatus.Error) return t("strip.error", { name });
  if (job.status === SpaceAddStatus.Queued) return t("strip.queued", { count: job.total, name });
  return t("strip.running", { done: job.done, total: job.total, name });
}

export function SpaceAddsStrip() {
  const t = useTranslations("spaces");
  const jobs = useSpaceAdds((s) => s.jobs);
  const retryFailed = useSpaceAdds((s) => s.retryFailed);
  const dismiss = useSpaceAdds((s) => s.dismiss);

  const list = Object.values(jobs);
  const job =
    list.find((j) => j.status === SpaceAddStatus.Running) ??
    list.find((j) => j.status !== SpaceAddStatus.Done) ??
    list[0];

  const quietDone = job?.status === SpaceAddStatus.Done && job.failed.length === 0;
  const doneId = quietDone ? job.vaultId : null;
  useEffect(() => {
    if (!doneId) return;
    const t = setTimeout(() => dismiss(doneId), AUTO_DISMISS_MS);
    return () => clearTimeout(t);
  }, [doneId, dismiss]);

  if (!job) return null;

  const pct = job.total > 0 ? Math.min(100, Math.round((job.done / job.total) * 100)) : 0;
  const finished = job.status === SpaceAddStatus.Done || job.status === SpaceAddStatus.Error;

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+var(--safe-bottom))] z-40 flex justify-center px-3 md:bottom-4"
    >
      <div className="pointer-events-auto w-full max-w-md overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-lg">
        <div className="flex items-center gap-3 px-3.5 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--color-text)]">{label(job, t)}</p>
            {job.failed.length > 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">
                {t("strip.failed", { count: job.failed.length })}
              </p>
            )}
          </div>
          {job.failed.length > 0 && job.status !== SpaceAddStatus.Running && (
            <button
              type="button"
              onClick={() => retryFailed(job.vaultId)}
              className="flex-shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/10"
            >
              {t("strip.retry")}
            </button>
          )}
          {finished && (
            <button
              type="button"
              aria-label={t("strip.dismiss")}
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
  const active = useSpaceAdds((s) =>
    Object.values(s.jobs).some((j) => j.status === SpaceAddStatus.Running),
  );

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
