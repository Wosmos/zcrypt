"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { listVaultSnapshots, createVaultSnapshot, deleteVaultSnapshot, listFiles } from "@/lib/api";
import type { VaultSnapshot, FileMetadata } from "@/types";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
import { SkeletonRow } from "@/components/ui/skeletons";
import { Layers, Trash2, ChevronDown } from "@/lib/icons";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function SnapshotsTab() {
  const [snapshots, setSnapshots] = useState<VaultSnapshot[]>([]);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VaultSnapshot | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([listVaultSnapshots(), listFiles()])
      .then(([snaps, f]) => { setSnapshots(snaps); setFiles(f); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const snap = await createVaultSnapshot(label || "Manual snapshot");
      setSnapshots((prev) => [snap, ...prev]);
      setLabel("");
    } catch { /* ignore */ }
    finally { setCreating(false); }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteVaultSnapshot(pendingDelete.id);
      setSnapshots((prev) => prev.filter((s) => s.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  const getFileName = (fileId: string) => files.find((f) => f.id === fileId)?.original_name || fileId.slice(0, 8);

  return (
    <div className="space-y-4">
      {/* Create snapshot */}
      <div className="panel p-6">
        <Section title="Take snapshot" description="Capture the current state of your entire vault.">
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Snapshot label (optional)"
              onKeyDown={(e) => { if (e.key === "Enter" && !creating) handleCreate(); }}
              className="h-10 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm placeholder:text-[var(--color-text-muted)] outline-none transition-all focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
            />
            <Button onClick={handleCreate} disabled={creating} className="sm:w-auto">
              {creating ? "Creating..." : "Take snapshot"}
            </Button>
          </div>
        </Section>
      </div>

      {/* Snapshot list */}
      {loading ? (
        <div className="panel divide-y divide-[var(--color-border)] px-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : snapshots.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={<Layers className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title="No snapshots yet"
            description="Take a snapshot to capture your current vault state. You can review the included files at any time."
          />
        </div>
      ) : (
        <div className="space-y-2">
          {snapshots.map((snap) => {
            const isOpen = expanded === snap.id;
            return (
              <motion.div key={snap.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="panel overflow-hidden">
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-[var(--color-text)]">{snap.label || "Unnamed snapshot"}</h3>
                    <div className="mt-1 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                      <span className="tabular-nums">{snap.file_count} files</span>
                      <span className="tabular-nums">{formatBytes(snap.total_size)}</span>
                      <span className="tabular-nums">{formatDate(snap.created_at)}</span>
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <button
                      onClick={() => setExpanded(isOpen ? null : snap.id)}
                      aria-expanded={isOpen}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-surface-1)]"
                    >
                      {isOpen ? "Hide" : "View files"}
                      <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
                    </button>
                    <IconButton icon={Trash2} label="Delete snapshot" variant="danger" iconClassName="h-3.5 w-3.5" onClick={() => setPendingDelete(snap)} />
                  </div>
                </div>
                {isOpen && snap.file_ids.length > 0 && (
                  <div className="border-t border-[var(--color-border)] px-4 pb-4 pt-3">
                    <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                      {snap.file_ids.map((fid) => (
                        <span key={fid} className="truncate text-xs text-[var(--color-text-muted)]">{getFileName(fid)}</span>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        destructive
        title="Delete snapshot?"
        description={
          <>
            This permanently removes the snapshot
            {pendingDelete?.label ? <> &ldquo;{pendingDelete.label}&rdquo;</> : null}. Your files are not affected. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
