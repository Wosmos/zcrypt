"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { listIntegritySnapshots, createIntegritySnapshot, checkFileIntegrity, getChangedFiles } from "@/lib/api";
import { ensureFiles } from "@/store/files";
import type { IntegritySnapshot, FileMetadata } from "@/types";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRow } from "@/components/ui/skeletons";
import { AlertTriangle, ShieldCheck } from "@/lib/icons";
import { cn, formatDateTime } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  changed: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};
function statusClass(status: string): string {
  return STATUS_STYLES[status] ?? "bg-red-500/10 text-red-600 dark:text-red-400";
}
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", statusClass(status))}>
      {status}
    </span>
  );
}

export function IntegrityTab() {
  const [snapshots, setSnapshots] = useState<IntegritySnapshot[]>([]);
  const [changes, setChanges] = useState<IntegritySnapshot[]>([]);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState("");
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    Promise.all([listIntegritySnapshots(), getChangedFiles(), ensureFiles()])
      .then(([snaps, changed, f]) => { setSnapshots(snaps); setChanges(changed); setFiles(f); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSnapshot = async () => {
    if (!selectedFile) return;
    setCreating(true);
    try { const snap = await createIntegritySnapshot(selectedFile); setSnapshots((prev) => [snap, ...prev]); }
    catch { /* ignore */ }
    finally { setCreating(false); }
  };

  const handleCheck = async (fileId: string) => {
    setChecking(true);
    try {
      const result = await checkFileIntegrity(fileId);
      setSnapshots((prev) => [result, ...prev]);
      if (result.status !== "ok") { setChanges((prev) => [result, ...prev.filter((c) => c.file_id !== fileId)]); }
      else { setChanges((prev) => prev.filter((c) => c.file_id !== fileId)); }
    } catch { /* ignore */ }
    finally { setChecking(false); }
  };

  return (
    <div className="space-y-4">
      {/* Changes alert */}
      {changes.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/20 bg-red-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-red-600 dark:text-red-400">
              <span className="tabular-nums">{changes.length}</span> file(s) with integrity changes detected
            </p>
            <div className="mt-2 space-y-1">
              {changes.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-[var(--color-text)]">{c.file_name}</span>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Create snapshot / check */}
      <div className="panel p-6">
        <Section title="Snapshot & verify" description="Record a file's fingerprint, then check it later for tampering.">
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              className="h-10 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text)] outline-none transition-all focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
            >
              <option value="">Select a file...</option>
              {files.map((f) => <option key={f.id} value={f.id}>{f.original_name}</option>)}
            </select>
            <div className="flex gap-2">
              <Button onClick={handleSnapshot} disabled={!selectedFile || creating} className="flex-1 sm:flex-none">
                {creating ? "Snapshotting..." : "Snapshot"}
              </Button>
              <Button variant="secondary" onClick={() => selectedFile && handleCheck(selectedFile)} disabled={!selectedFile || checking} className="flex-1 sm:flex-none">
                {checking ? "Checking..." : "Check"}
              </Button>
            </div>
          </div>
        </Section>
      </div>

      {/* Snapshot history */}
      <Section title="Snapshot history">
        {loading ? (
          <div className="panel divide-y divide-[var(--color-border)] px-4">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
          </div>
        ) : snapshots.length === 0 ? (
          <div className="panel">
            <EmptyState
              icon={<ShieldCheck className="h-7 w-7 text-[var(--color-text-muted)]" />}
              title="No snapshots yet"
              description="Select a file above and take a snapshot to start tracking its integrity over time."
            />
          </div>
        ) : (
          <div className="space-y-2">
            {snapshots.slice(0, 50).map((snap) => (
              <motion.div key={snap.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                className="panel flex items-center justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--color-text)]">{snap.file_name}</p>
                  <p className="mt-0.5 truncate font-mono text-xs text-[var(--color-text-muted)]">{snap.sha256.slice(0, 16)}...</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-3">
                  <StatusBadge status={snap.status} />
                  <span className="text-xs tabular-nums text-[var(--color-text-muted)]">{formatDateTime(snap.checked_at)}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
