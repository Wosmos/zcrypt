"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getIncompleteUploads, type IncompleteUpload } from "@/lib/api";
import { cancelUpload } from "@/lib/upload-session";
import { formatBytes } from "@/lib/utils";
import { toast } from "@/store/toast";
import { useUploadStore } from "@/store/upload";
import { AlertTriangle, ChevronDown, Clock, Play, Trash2, X } from "@/lib/icons";
import { platformName } from "@/lib/platforms";
import { isTauri, pickFiles, toDesktopFile } from "@/lib/tauri";

// Human-friendly "expires in ..." from an ISO timestamp. Server keeps unfinished
// uploads for 7 days, so natural units run from minutes up to about a week.
function expiresInLabel(expiresAt: string, now: number): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "expiring now";
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `expires in ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `expires in ${hours} hour${hours === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  if (days < 14) return `expires in ${days} day${days === 1 ? "" : "s"}`;
  const weeks = Math.round(days / 7);
  return `expires in ${weeks} week${weeks === 1 ? "" : "s"}`;
}


/**
 * Shows uploads that were started but never finished (from the server's active
 * upload sessions), so a user can see WHAT is pending — including which storage
 * platform it was going to — resume it, or discard it. Unfinished uploads are
 * auto-removed after 7 days; that caution is shown so their disappearance isn't
 * a surprise.
 *
 * Resume needs the file's bytes, which the browser can't re-read on its own — so
 * Resume prompts to re-select the file, then hands it (WITH the session record,
 * so the platform pin survives) to the upload flow, which continues from the
 * server's already-received chunks on the session's original platform.
 */
export function IncompleteUploads({ onResume }: { onResume: (file: File, upload: IncompleteUpload) => void }) {
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

  // Hide sessions the transfer dock is still handling in THIS tab. An in-progress
  // upload is an "active" server session, so without this cross-reference it wrongly
  // appears here as "unfinished / resume or discard" while it's plainly still going.
  const queue = useUploadStore((s) => s.queue);
  const liveKeys = useMemo(
    () => new Set(queue.filter((i) => i.status !== "done").map((i) => `${i.file.name}::${i.file.size}`)),
    [queue],
  );
  // When an in-tab upload finishes, its server session flips to complete — re-fetch
  // so it drops off the list instead of lingering as "unfinished".
  const doneCount = queue.filter((i) => i.status === "done").length;
  useEffect(() => {
    void refresh();
  }, [doneCount, refresh]);

  const visible = uploads.filter((u) => !liveKeys.has(`${u.filename}::${u.original_size}`));

  // Hand a picked file to the resume flow, guarding against the wrong file (the
  // server chunks belong to a specific file — a mismatch would corrupt it).
  const resumeWithFile = useCallback(
    (file: File, target: IncompleteUpload) => {
      if (file.name !== target.filename || file.size !== target.original_size) {
        toast.warning(`That's not the same file — pick "${target.filename}" (${formatBytes(target.original_size)}) to resume.`);
        return;
      }
      onResume(file, target); // resumes the session on its ORIGINAL platform
      setUploads((prev) => prev.filter((u) => u.session_id !== target.session_id));
      toast.info(`Resuming "${target.filename}"…`);
    },
    [onResume],
  );

  const onResumeClick = async (u: IncompleteUpload) => {
    // Desktop: use the native Tauri picker and wrap the result so it carries an
    // absolute .path — the hidden HTML <input> below yields a browser File with
    // NO path, which makes the desktop upload flow open a SECOND native dialog
    // to re-acquire the path. Web keeps the hidden-input path (no disk paths).
    if (isTauri) {
      const [p] = await pickFiles({ multiple: false, title: `Select "${u.filename}" to resume` });
      if (!p) return;
      resumeWithFile(toDesktopFile(p), u);
      return;
    }
    resumeTargetRef.current = u;
    fileInputRef.current?.click();
  };

  const onFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    const target = resumeTargetRef.current;
    resumeTargetRef.current = null;
    if (!file || !target) return;
    resumeWithFile(file, target);
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

  if (visible.length === 0) return null;

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
          {visible.length} unfinished upload{visible.length > 1 ? "s" : ""}
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
            Unfinished uploads are kept for 7 days, then automatically removed.
          </div>

          <ul className="divide-y divide-[var(--color-border)]">
            {visible.map((u) => {
              const pct = u.chunk_count > 0 ? Math.min(100, Math.round((u.uploaded_chunks / u.chunk_count) * 100)) : 0;
              const platform = platformName(u.platform);
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
                        onClick={() => void onResumeClick(u)}
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
