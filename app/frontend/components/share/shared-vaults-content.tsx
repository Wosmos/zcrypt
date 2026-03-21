"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  listSharedVaults,
  createSharedVault,
  getSharedVault,
  addSharedVaultMember,
  removeSharedVaultMember,
  deleteSharedVault,
  listFiles,
} from "@/lib/api";
import type { SharedVault, SharedVaultDetail, FileMetadata } from "@/types";
import { useAuthStore } from "@/store/auth";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { Plus, Trash2, ArrowRight } from "@/lib/icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function SharedVaultsContent() {
  const [vaults, setVaults] = useState<SharedVault[]>([]);
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<SharedVaultDetail | null>(null);
  const user = useAuthStore((s) => s.user);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("viewer");
  const [addingMember, setAddingMember] = useState(false);

  useEffect(() => {
    Promise.all([listSharedVaults(), listFiles()])
      .then(([v, f]) => { setVaults(v); setFiles(f); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async () => {
    setError("");
    if (!name.trim()) { setError("Name is required"); return; }
    setCreating(true);
    try {
      const vault = await createSharedVault({ name: name.trim(), description: description.trim(), file_ids: selectedFiles });
      setVaults((prev) => [vault, ...prev]);
      setShowCreate(false);
      setName(""); setDescription(""); setSelectedFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally { setCreating(false); }
  };

  const openDetail = async (vaultId: string) => {
    try { setDetail(await getSharedVault(vaultId)); } catch { /* ignore */ }
  };

  const handleAddMember = async () => {
    if (!detail || !memberEmail.trim()) return;
    setAddingMember(true);
    try {
      const member = await addSharedVaultMember(detail.id, memberEmail.trim(), memberRole);
      setDetail({ ...detail, members: [...detail.members, member] });
      setMemberEmail("");
    } catch { setError("Failed to add member"); }
    finally { setAddingMember(false); }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!detail) return;
    try {
      await removeSharedVaultMember(detail.id, userId);
      setDetail({ ...detail, members: detail.members.filter((m) => m.user_id !== userId) });
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this shared vault? Files will not be deleted.")) return;
    try {
      await deleteSharedVault(id);
      setVaults((prev) => prev.filter((v) => v.id !== id));
      if (detail?.id === id) setDetail(null);
    } catch { /* ignore */ }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <LogoSpinner size="md" speed="fast" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="section-label">Shared Vaults</h2>
        <Button onClick={() => { setShowCreate(!showCreate); setDetail(null); }} size="sm" variant={showCreate ? "secondary" : "primary"}>
          {showCreate ? "Cancel" : <><Plus className="h-3.5 w-3.5" /> New Vault</>}
        </Button>
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">{error}</div>
      )}

      {/* Create form */}
      <AnimatePresence>
        {showCreate && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <section className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-[var(--color-border)]">
                <h3 className="text-sm font-semibold">Create Shared Vault</h3>
              </div>
              <div className="p-5 space-y-4">
                <input
                  type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vault name"
                  className="w-full h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40"
                />
                <input
                  type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)"
                  className="w-full h-10 px-3.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40"
                />
                {files.length > 0 && (
                  <div>
                    <label className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">Add files (optional)</label>
                    <div className="mt-1.5 max-h-32 overflow-y-auto space-y-1 border border-[var(--color-border)] rounded-xl p-2">
                      {files.map((f) => (
                        <label key={f.id} className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-[var(--color-surface-1)] cursor-pointer">
                          <input type="checkbox" checked={selectedFiles.includes(f.id)} onChange={() => setSelectedFiles((prev) => prev.includes(f.id) ? prev.filter((id) => id !== f.id) : [...prev, f.id])} className="w-4 h-4 rounded accent-[var(--color-accent)]" />
                          <span className="text-sm truncate">{f.original_name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                <Button onClick={handleCreate} disabled={creating} className="w-full">
                  {creating ? "Creating..." : "Create"}
                </Button>
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Detail view */}
      {detail && (
        <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
            <div>
              <h3 className="text-sm font-semibold">{detail.name}</h3>
              {detail.description && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{detail.description}</p>}
            </div>
            <button onClick={() => setDetail(null)} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Close</button>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <h4 className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Members ({detail.members?.length || 0})</h4>
              <div className="space-y-2">
                {detail.members?.map((m) => (
                  <div key={m.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span>{m.username || m.email}</span>
                      <span className="text-[10px] font-medium px-1.5 py-0.5 bg-[var(--color-surface-1)] rounded text-[var(--color-text-muted)]">{m.role}</span>
                    </div>
                    {m.user_id !== user?.id && detail.owner_id === user?.id && (
                      <button onClick={() => handleRemoveMember(m.user_id)} className="text-xs text-red-400 hover:underline">Remove</button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {detail.owner_id === user?.id && (
              <div className="flex gap-2">
                <input type="email" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} placeholder="Email address"
                  className="flex-1 h-9 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]/40" />
                <select value={memberRole} onChange={(e) => setMemberRole(e.target.value)}
                  className="h-9 px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm focus:outline-none">
                  <option value="viewer">Viewer</option>
                  <option value="editor">Editor</option>
                  <option value="admin">Admin</option>
                </select>
                <Button onClick={handleAddMember} disabled={addingMember} size="sm">
                  {addingMember ? "..." : "Add"}
                </Button>
              </div>
            )}
            <p className="text-xs text-[var(--color-text-muted)]">{detail.file_ids?.length || 0} files shared</p>
          </div>
        </motion.section>
      )}

      {/* Vault list */}
      {vaults.length === 0 && !showCreate ? (
        <div className="card text-center py-12">
          <p className="text-[var(--color-text-muted)]">No shared vaults yet.</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">Create one to start collaborating.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {vaults.map((vault) => (
            <motion.div
              key={vault.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center justify-between p-4 card cursor-pointer hover:border-[var(--color-accent)]/30 transition-colors"
              onClick={() => openDetail(vault.id)}
            >
              <div className="min-w-0 flex-1">
                <h3 className="font-medium">{vault.name}</h3>
                <div className="flex items-center gap-3 text-xs text-[var(--color-text-muted)] mt-0.5">
                  {vault.description && <span>{vault.description}</span>}
                  <span>{vault.file_ids?.length || 0} files</span>
                  <span>{formatDate(vault.created_at)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)]" />
                {vault.owner_id === user?.id && (
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(vault.id); }} className="p-1.5 text-[var(--color-text-muted)] hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
