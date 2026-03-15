"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminCreateToken, adminDeleteToken, adminToggleTokenScope } from "@/lib/api";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { Key, Trash2, Globe, User, Plus, X } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import type { PlatformTokenInfo } from "@/types";
import { ConfirmModal } from "@/components/ui/confirm-modal";

export function TokenManagement({
  tokens,
  onRefresh,
  currentUserId,
}: {
  tokens: PlatformTokenInfo[];
  onRefresh: () => void;
  currentUserId: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [platform, setPlatform] = useState("github");
  const [token, setToken] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [scopeOverrides, setScopeOverrides] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<PlatformTokenInfo | null>(null);

  // Clear optimistic overrides when fresh data arrives from parent
  useEffect(() => { setScopeOverrides({}); }, [tokens]);

  const resolveGlobal = (t: PlatformTokenInfo) =>
    t.id in scopeOverrides ? scopeOverrides[t.id] : t.is_global;

  const platformNames: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    huggingface: "Hugging Face",
  };

  const handleCreate = async () => {
    if (!token.trim()) return;
    setCreating(true);
    try {
      const result = await adminCreateToken({
        platform,
        token: token.trim(),
        is_global: isGlobal,
      });
      toast.success(`Token added for @${result.username}`);
      setToken("");
      setShowForm(false);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create token");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleScope = async (t: PlatformTokenInfo) => {
    const newScope = !resolveGlobal(t);
    setScopeOverrides((prev) => ({ ...prev, [t.id]: newScope }));
    try {
      await adminToggleTokenScope(t.id, newScope);
      onRefresh();
    } catch (err) {
      setScopeOverrides((prev) => { const next = { ...prev }; delete next[t.id]; return next; });
      toast.error(err instanceof Error ? err.message : "Failed to update token scope");
    }
  };

  const executeDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(deleteTarget.id);
    try {
      await adminDeleteToken(deleteTarget.id);
      toast.success("Token deleted");
      setDeleteTarget(null);
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete token");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <section className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-sm font-semibold">Platform Tokens</h2>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              {tokens.length} token{tokens.length !== 1 ? "s" : ""} registered
            </p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className={cn(
              "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
              showForm
                ? "bg-[var(--color-surface-2)] text-[var(--color-text)]"
                : "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20"
            )}
          >
            {showForm ? (
              <>
                <X className="h-3.5 w-3.5" /> Cancel
              </>
            ) : (
              <>
                <Plus className="h-3.5 w-3.5" /> Add Token
              </>
            )}
          </button>
        </div>

        {showForm && (
          <div className="p-5 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]/50 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <select
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
              >
                <option value="github">GitHub</option>
                <option value="gitlab">GitLab</option>
                <option value="huggingface">Hugging Face</option>
              </select>
              <div className="flex-1">
                <Input
                  type="password"
                  placeholder="Platform access token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  icon={<Key className="h-4 w-4" />}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isGlobal}
                  onChange={(e) => setIsGlobal(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--color-border)] text-cyan-500 focus:ring-cyan-500/30"
                />
                <span className="text-sm text-[var(--color-text-secondary)]">
                  Global token (available to all users)
                </span>
              </label>
              <Button onClick={handleCreate} disabled={creating || !token.trim()}>
                {creating ? (
                  <span className="flex items-center gap-2">
                    <LogoSpinner size={14} speed="fast" />
                    Adding...
                  </span>
                ) : (
                  "Add Token"
                )}
              </Button>
            </div>
          </div>
        )}

        {tokens.length === 0 ? (
          <div className="p-8 text-center text-sm text-[var(--color-text-muted)]">
            No platform tokens registered yet
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {tokens.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-surface-1)] transition-colors"
              >
                <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--color-surface-2)] flex-shrink-0">
                  <Key className="h-4 w-4 text-[var(--color-text-muted)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      {platformNames[t.platform] ?? t.platform}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      @{t.username}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Added {new Date(t.created_at).toLocaleDateString()}
                  </p>
                </div>
                {t.user_id === currentUserId ? (
                  <button
                    onClick={() => handleToggleScope(t)}
                    title={resolveGlobal(t) ? "Click to make local (owner-only)" : "Click to make global (all users)"}
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors cursor-pointer",
                      resolveGlobal(t)
                        ? "bg-blue-500/10 text-blue-500 border border-blue-500/20 hover:bg-blue-500/20"
                        : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
                    )}
                  >
                    {resolveGlobal(t) ? (
                      <Globe className="h-3.5 w-3.5" />
                    ) : (
                      <User className="h-3.5 w-3.5" />
                    )}
                    {resolveGlobal(t) ? "Global" : "Local"}
                  </button>
                ) : (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg",
                      resolveGlobal(t)
                        ? "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                        : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border)]"
                    )}
                  >
                    {resolveGlobal(t) ? (
                      <Globe className="h-3.5 w-3.5" />
                    ) : (
                      <User className="h-3.5 w-3.5" />
                    )}
                    {resolveGlobal(t) ? "Global" : "Local"}
                  </span>
                )}
                {t.user_id === currentUserId && (
                  <button
                    onClick={() => setDeleteTarget(t)}
                    disabled={deleting === t.id}
                    className="flex items-center justify-center h-7 w-7 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-colors disabled:opacity-50"
                    title="Delete token"
                  >
                    {deleting === t.id ? (
                      <LogoSpinner size={14} speed="fast" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Confirm delete token modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onConfirm={executeDelete}
        onClose={() => setDeleteTarget(null)}
        title="Delete Token"
        description={
          deleteTarget
            ? `Delete the ${platformNames[deleteTarget.platform] ?? deleteTarget.platform} token for @${deleteTarget.username}?${deleteTarget.is_global ? " This is a global token — removing it will affect all users." : ""}`
            : ""
        }
        details={deleteTarget ? `${platformNames[deleteTarget.platform] ?? deleteTarget.platform} @${deleteTarget.username}` : undefined}
        confirmLabel="Delete Token"
        variant="danger"
        loading={deleting === deleteTarget?.id}
      />
    </>
  );
}
