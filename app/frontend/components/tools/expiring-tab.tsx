"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { listExpiringVaults, createExpiringVault, deleteExpiringVault, listFiles } from "@/lib/api";
import type { ExpiringVault, FileMetadata } from "@/types";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonRow } from "@/components/ui/skeletons";
import { Plus, Trash2, Clock } from "@/lib/icons";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  if (days > 0) return `${days}d ${hours}h`;
  const minutes = Math.floor((diff % 3600000) / 60000);
  return `${hours}h ${minutes}m`;
}

const EXPIRY_CHOICES = [
  { value: "1", label: "1 hour" },
  { value: "6", label: "6 hours" },
  { value: "24", label: "24 hours" },
  { value: "168", label: "7 days" },
  { value: "720", label: "30 days" },
  { value: "2160", label: "90 days" },
];

const inputClass =
  "h-10 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] outline-none transition-all focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10";
const labelClass = "text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]";

export function ExpiringTab() {
  const reduceMotion = useReducedMotion();
  const [vaults, setVaults] = useState<ExpiringVault[]>([]);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [expiresIn, setExpiresIn] = useState("24");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ExpiringVault | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([listExpiringVaults(), listFiles()])
      .then(([v, f]) => { setVaults(v); setFiles(f); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setError("");
    if (!name.trim()) { setError("Vault name is required"); return; }
    if (selectedFiles.length === 0) { setError("Select at least one file"); return; }
    setCreating(true);
    try {
      const expiresAt = new Date(Date.now() + Number(expiresIn) * 3600000).toISOString();
      const vault = await createExpiringVault({ name: name.trim(), description: description.trim(), expires_at: expiresAt, file_ids: selectedFiles });
      setVaults((prev) => [vault, ...prev]);
      setShowCreate(false);
      setName(""); setDescription(""); setSelectedFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create vault");
    } finally { setCreating(false); }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteExpiringVault(pendingDelete.id);
      setVaults((prev) => prev.filter((v) => v.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch { /* ignore */ }
    finally { setDeleting(false); }
  };

  const getFileName = (fileId: string) => files.find((f) => f.id === fileId)?.original_name || fileId.slice(0, 8);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--color-text-secondary)]">Group files behind an auto-destruction timer.</p>
        <Button onClick={() => { setShowCreate(!showCreate); setError(""); }} size="sm" variant={showCreate ? "secondary" : "primary"}>
          {showCreate ? "Cancel" : <><Plus className="h-3.5 w-3.5" /> Create vault</>}
        </Button>
      </div>

      <AnimatePresence initial={false}>
        {showCreate && (
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="panel space-y-4 p-6">
              <h3 className="text-sm font-semibold text-[var(--color-text)]">New expiring vault</h3>
              <div className="space-y-1.5">
                <label className={labelClass}>Name *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tax Documents 2025" className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Description</label>
                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description..." className={inputClass} />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Expires in</label>
                <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)} className={inputClass}>
                  {EXPIRY_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>Select files *</label>
                {files.length === 0 ? (
                  <p className="text-sm text-[var(--color-text-muted)]">No files uploaded yet.</p>
                ) : (
                  <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-[var(--color-border)] p-2">
                    {files.map((file) => (
                      <label key={file.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-1)]">
                        <input
                          type="checkbox"
                          checked={selectedFiles.includes(file.id)}
                          onChange={() => setSelectedFiles((prev) => prev.includes(file.id) ? prev.filter((id) => id !== file.id) : [...prev, file.id])}
                          className="h-4 w-4 rounded accent-[var(--color-accent)]"
                        />
                        <span className="truncate text-sm text-[var(--color-text)]">{file.original_name}</span>
                      </label>
                    ))}
                  </div>
                )}
                {selectedFiles.length > 0 && <p className="text-xs tabular-nums text-[var(--color-text-muted)]">{selectedFiles.length} file(s) selected</p>}
              </div>
              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400" role="alert">
                  {error}
                </div>
              )}
              <Button onClick={handleCreate} disabled={creating} className="w-full">
                {creating ? "Creating..." : "Create vault"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="panel divide-y divide-[var(--color-border)] px-4">
          {Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} />)}
        </div>
      ) : vaults.length === 0 && !showCreate ? (
        <div className="panel">
          <EmptyState
            icon={<Clock className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title="No expiring vaults yet"
            description="Create one to group files with an auto-destruction timer. The files themselves stay in your vault."
          />
        </div>
      ) : vaults.length > 0 ? (
        <div className="space-y-2">
          {vaults.map((vault) => (
            <motion.div
              key={vault.id}
              initial={reduceMotion ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn("panel p-4", vault.expired && "opacity-60")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium text-[var(--color-text)]">{vault.name}</h3>
                    <span className={cn(
                      "flex-shrink-0 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide tabular-nums",
                      vault.expired ? "bg-red-500/10 text-red-600 dark:text-red-400" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    )}>
                      {vault.expired ? "Expired" : timeUntil(vault.expires_at)}
                    </span>
                  </div>
                  {vault.description && <p className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">{vault.description}</p>}
                  <div className="mt-2 flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                    <span className="tabular-nums">{vault.file_ids.length} file(s)</span>
                    <span>Expires {formatDate(vault.expires_at)}</span>
                  </div>
                  {vault.file_ids.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {vault.file_ids.slice(0, 5).map((fid) => (
                        <span key={fid} className="max-w-[150px] truncate rounded-md bg-[var(--color-surface-1)] px-2 py-0.5 text-[10px] text-[var(--color-text-muted)]">{getFileName(fid)}</span>
                      ))}
                      {vault.file_ids.length > 5 && <span className="px-1 py-0.5 text-[10px] text-[var(--color-text-muted)]">+{vault.file_ids.length - 5} more</span>}
                    </div>
                  )}
                </div>
                <IconButton icon={Trash2} label="Delete vault" variant="danger" iconClassName="h-3.5 w-3.5" onClick={() => setPendingDelete(vault)} />
              </div>
            </motion.div>
          ))}
        </div>
      ) : null}

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => { if (!o) setPendingDelete(null); }}
        destructive
        title="Delete expiring vault?"
        description={
          <>
            This removes the vault{pendingDelete?.name ? <> &ldquo;{pendingDelete.name}&rdquo;</> : null} and its timer. The files themselves are not deleted.
          </>
        }
        confirmLabel="Delete"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
