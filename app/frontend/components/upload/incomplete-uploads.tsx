"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getIncompleteUploads, type IncompleteUpload } from "@/lib/api";
import { cancelUpload } from "@/lib/upload-session";
import { formatBytes } from "@/lib/utils";
import { toast } from "@/store/toast";
import { AlertTriangle, ChevronDown, Clock, Play, Trash2, X } from "@/lib/icons";

// Human-friendly "expires in ~Xh" from an ISO timestamp. Server keeps unfinished
// uploads for 24h, so this is always a small, positive window.
function expiresInLabel(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "expiring now";
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `expires in ${hours}h`;
  const mins = Math.max(1, Math.floor(ms / 60_000));
  return `expires in ${mins}m`;
}

const PLATFORM_LABELS: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  huggingface: "HuggingFace",
  telegram: "Telegram",
};

/**
 * Shows uploads that were started but never finished (from the server's active
 * upload sessions), so a user can see WHAT is pending — including which storage
 * platform it was going to — resume it, or discard it. Unfinished uploads are
 * auto-removed after 24h; that caution is shown so their disappearance isn't a
 * surprise.
 *
 * Resume needs the file's bytes, which the browser can't re-read on its own — so
 * Resume prompts to re-select the file, then hands it to the normal upload flow
 * (which continues from the server's already-received chunks).
 */
export function IncompleteUploads({ onResume }: { onResume: (file: File) => void }) {
  const [uploads, setUploads] = useState<IncompleteUpload[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const resumeTargetRef = useRef<IncompleteUpload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const { uploads } = await getIncompleteUploads();
      setUploads(uploads);
    } catch {
      // Non-critical UI — a failed fetch just leaves the section empty.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onResumeClick = (u: IncompleteUpload) => {
    resumeTargetRef.current = u;
    fileInputRef.current?.click();
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    const target = resumeTargetRef.current;
    resumeTargetRef.current = null;
    if (!file || !target) return;
    // Guard against picking the wrong file — the chunks already on the server
    // belong to a specific file; a mismatch would corrupt the result.
    if (file.name !== target.filename || file.size !== target.original_size) {
      toast.warning(`That's not the same file — pick "${target.filename}" (${formatBytes(target.original_size)}) to resume.`);
      return;
    }
    onResume(file); // hands off to the normal upload flow, which auto-resumes
    setUploads((prev) => prev.filter((u) => u.session_id !== target.session_id));
    toast.info(`Resuming "${target.filename}"…`);
  };

  const onDiscard = async (u: IncompleteUpload) => {
    setBusy(u.session_id);
    try {
      await cancelUpload(u.session_id);
      setUploads((prev) => prev.filter((x) => x.session_id !== u.session_id));
      toast.info(`Discarded "${u.filename}"`);
    } catch {
      toast.error("Couldn't discard that upload — try again.");
    } finally {
      setBusy(null);
    }
  };

  if (uploads.length === 0) return null;

  const now = Date.now();

  return (
    <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/[0.04] overflow-hidden">
      <input ref={fileInputRef} type="file" className="hidden" onChange={onFilePicked} />

      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left"
      >
        <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
        <span className="text-sm font-medium text-[var(--color-text)]">
          {uploads.length} unfinished upload{uploads.length > 1 ? "s" : ""}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">— resume or discard</span>
        <ChevronDown
          className={`ml-auto h-4 w-4 text-[var(--color-text-muted)] transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-amber-500/20">
          <div className="flex items-center gap-1.5 px-4 py-2 text-[11px] text-[var(--color-text-muted)]">
            <Clock className="h-3 w-3" />
            Unfinished uploads are kept for 24 hours, then automatically removed.
          </div>

          <ul className="divide-y divide-[var(--color-border)]">
            {uploads.map((u) => {
              const pct = u.chunk_count > 0 ? Math.round((u.uploaded_chunks / u.chunk_count) * 100) : 0;
              const platform = PLATFORM_LABELS[u.platform] ?? u.platform;
              return (
                <li key={u.session_id} className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" title={u.filename}>
                        {u.filename}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-text-secondary)]">
                        <span className="tabular-nums">{formatBytes(u.original_size)}</span>
                        <span className="text-[var(--color-text-muted)]">·</span>
                        <span className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] font-medium">
                          {platform}
                        </span>
                        <span className="text-[var(--color-text-muted)]">·</span>
                        <span className="tabular-nums">{pct}%</span>
                        <span className="text-[var(--color-text-muted)]">·</span>
                        <span className="text-amber-600 dark:text-amber-400">{expiresInLabel(u.expires_at, now)}</span>
                      </div>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--color-surface)]">
                        <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <button
                        onClick={() => onResumeClick(u)}
                        className="flex items-center gap-1 rounded-lg bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90"
                        title="Re-select this file to continue the upload"
                      >
                        <Play className="h-3.5 w-3.5" />
                        Resume
                      </button>
                      <button
                        onClick={() => onDiscard(u)}
                        disabled={busy === u.session_id}
                        className="flex items-center justify-center rounded-lg border border-[var(--color-border)] p-1.5 text-[var(--color-text-muted)] transition-colors hover:border-red-400/40 hover:text-red-400 disabled:opacity-50"
                        title="Discard this unfinished upload"
                      >
                        {busy === u.session_id ? <X className="h-3.5 w-3.5 animate-pulse" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
