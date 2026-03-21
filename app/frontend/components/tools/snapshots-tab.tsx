"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { listVaultSnapshots, createVaultSnapshot, deleteVaultSnapshot, listFiles } from "@/lib/api";
import type { VaultSnapshot, FileMetadata } from "@/types";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { Trash2, ChevronDown } from "@/lib/icons";
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this snapshot?")) return;
    try { await deleteVaultSnapshot(id); setSnapshots((prev) => prev.filter((s) => s.id !== id)); } catch { /* ignore */ }
  };

  const getFileName = (fileId: string) => files.find((f) => f.id === fileId)?.original_name || fileId.slice(0, 8);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LogoSpinner size="md" speed="fast" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Create snapshot */}
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-sm font-semibold">Take Snapshot</h3>
        </div>
        <div className="p-5 flex gap-3">
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Snapshot label (optional)"
            className="flex-1 h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40" />
          <Button onClick={handleCreate} disabled={creating}>
            {creating ? "Creating..." : "Take Snapshot"}
          </Button>
        </div>
      </section>

      {/* Snapshot list */}
      {snapshots.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-[var(--color-text-muted)]">No snapshots yet.</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Take a snapshot to capture your current vault state.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {snapshots.map((snap) => (
            <motion.div key={snap.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="card overflow-hidden">
              <div className="flex items-start justify-between p-4">
                <div>
                  <h3 className="text-sm font-medium">{snap.label || "Unnamed snapshot"}</h3>
                  <div className="flex items-center gap-4 mt-1 text-xs text-[var(--color-text-muted)]">
                    <span>{snap.file_count} files</span>
                    <span>{formatBytes(snap.total_size)}</span>
                    <span>{formatDate(snap.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setExpanded(expanded === snap.id ? null : snap.id)}
                    className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline">
                    {expanded === snap.id ? "Hide" : "View files"}
                    <ChevronDown className={cn("h-3 w-3 transition-transform", expanded === snap.id && "rotate-180")} />
                  </button>
                  <button onClick={() => handleDelete(snap.id)} className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
              {expanded === snap.id && snap.file_ids.length > 0 && (
                <div className="px-4 pb-4 pt-0 border-t border-[var(--color-border)]">
                  <div className="grid grid-cols-2 gap-1 pt-3">
                    {snap.file_ids.map((fid) => (
                      <span key={fid} className="text-xs text-[var(--color-text-muted)] truncate">{getFileName(fid)}</span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
