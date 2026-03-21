"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { listExpiringVaults, createExpiringVault, deleteExpiringVault, listFiles } from "@/lib/api";
import type { ExpiringVault, FileMetadata } from "@/types";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { Plus, Trash2 } from "@/lib/icons";

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

export function ExpiringTab() {
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

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this vault? The files themselves will not be deleted.")) return;
    try { await deleteExpiringVault(id); setVaults((prev) => prev.filter((v) => v.id !== id)); } catch { /* ignore */ }
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
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(!showCreate)} size="sm" variant={showCreate ? "secondary" : "primary"}>
          {showCreate ? "Cancel" : <><Plus className="h-3.5 w-3.5" /> Create Vault</>}
        </Button>
      </div>

      {error && <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>}

      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <section className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <h3 className="text-sm font-semibold">New Expiring Vault</h3>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Name *</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tax Documents 2025"
                    className="mt-1.5 w-full h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Description</label>
                  <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional description..."
                    className="mt-1.5 w-full h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40" />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Expires In</label>
                  <select value={expiresIn} onChange={(e) => setExpiresIn(e.target.value)}
                    className="mt-1.5 w-full h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm focus:outline-none focus:border-[var(--color-accent)]/40">
                    <option value="1">1 hour</option>
                    <option value="6">6 hours</option>
                    <option value="24">24 hours</option>
                    <option value="168">7 days</option>
                    <option value="720">30 days</option>
                    <option value="2160">90 days</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Select Files *</label>
                  {files.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)] mt-1.5">No files uploaded yet.</p>
                  ) : (
                    <div className="mt-1.5 max-h-48 overflow-y-auto space-y-1 border border-[var(--color-border)] rounded-xl p-2">
                      {files.map((file) => (
                        <label key={file.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--color-surface-1)] cursor-pointer">
                          <input type="checkbox" checked={selectedFiles.includes(file.id)} onChange={() => setSelectedFiles((prev) => prev.includes(file.id) ? prev.filter((id) => id !== file.id) : [...prev, file.id])} className="w-4 h-4 rounded accent-[var(--color-accent)]" />
                          <span className="text-sm truncate">{file.original_name}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  {selectedFiles.length > 0 && <p className="text-xs text-[var(--color-text-muted)] mt-1">{selectedFiles.length} file(s) selected</p>}
                </div>
                <Button onClick={handleCreate} disabled={creating} className="w-full">
                  {creating ? "Creating..." : "Create Vault"}
                </Button>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {vaults.length === 0 && !showCreate ? (
        <div className="card text-center py-12">
          <p className="text-[var(--color-text-muted)]">No expiring vaults yet.</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Create one to group files with an auto-destruction timer.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {vaults.map((vault) => (
            <motion.div key={vault.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
              className={`p-4 card ${vault.expired ? "opacity-60" : ""}`}>
              <div className="flex items-start justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium truncate">{vault.name}</h3>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold uppercase ${vault.expired ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-500"}`}>
                      {vault.expired ? "Expired" : timeUntil(vault.expires_at)}
                    </span>
                  </div>
                  {vault.description && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{vault.description}</p>}
                  <div className="flex items-center gap-4 mt-2 text-xs text-[var(--color-text-muted)]">
                    <span>{vault.file_ids.length} file(s)</span>
                    <span>Expires {formatDate(vault.expires_at)}</span>
                  </div>
                  {vault.file_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {vault.file_ids.slice(0, 5).map((fid) => (
                        <span key={fid} className="px-2 py-0.5 bg-[var(--color-surface-1)] rounded-lg text-[10px] text-[var(--color-text-muted)] truncate max-w-[150px]">{getFileName(fid)}</span>
                      ))}
                      {vault.file_ids.length > 5 && <span className="text-[10px] text-[var(--color-text-muted)]">+{vault.file_ids.length - 5} more</span>}
                    </div>
                  )}
                </div>
                <button onClick={() => handleDelete(vault.id)} className="ml-3 p-1.5 text-[var(--color-text-muted)] hover:text-red-400 transition-colors">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
