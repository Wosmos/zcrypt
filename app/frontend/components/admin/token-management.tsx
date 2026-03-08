"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adminCreateToken, adminDeleteToken } from "@/lib/api";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { Key, Trash2, Globe, User, Plus, X } from "lucide-react";
import type { PlatformTokenInfo } from "@/types";

export function TokenManagement({
  tokens,
  onRefresh,
}: {
  tokens: PlatformTokenInfo[];
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [platform, setPlatform] = useState("github");
  const [token, setToken] = useState("");
  const [isGlobal, setIsGlobal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

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

  const handleDelete = async (tokenId: string) => {
    setDeleting(tokenId);
    try {
      await adminDeleteToken(tokenId);
      toast.success("Token deleted");
      onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete token");
    } finally {
      setDeleting(null);
    }
  };

  const platformNames: Record<string, string> = {
    github: "GitHub",
    gitlab: "GitLab",
    huggingface: "Hugging Face",
  };

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <div>
          <h2 className="text-sm font-semibold">Platform Tokens</h2>
          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
            {tokens.length} token{tokens.length !== 1 ? "s" : ""} registered
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={cn(
            "flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors",
            showForm
              ? "bg-[var(--color-surface-2)] text-[var(--color-text)]"
              : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20"
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
              className="h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
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
                className="h-4 w-4 rounded border-[var(--color-border)] text-emerald-500 focus:ring-emerald-500/30"
              />
              <span className="text-sm text-[var(--color-text-secondary)]">
                Global token (available to all users)
              </span>
            </label>
            <Button onClick={handleCreate} disabled={creating || !token.trim()}>
              {creating ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                  <span className="text-[13px] font-medium">
                    {platformNames[t.platform] ?? t.platform}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">
                    @{t.username}
                  </span>
                  {t.is_global ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                      <Globe className="h-2.5 w-2.5" />
                      Global
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border)]">
                      <User className="h-2.5 w-2.5" />
                      Personal
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)]">
                  Owner: {t.owner_email} &middot;{" "}
                  {new Date(t.created_at).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={() => handleDelete(t.id)}
                disabled={deleting === t.id}
                className="flex items-center justify-center h-7 w-7 rounded-lg hover:bg-red-500/10 text-[var(--color-text-muted)] hover:text-red-500 transition-colors disabled:opacity-50"
                title="Delete token"
              >
                {deleting === t.id ? (
                  <span className="h-3.5 w-3.5 border-2 border-[var(--color-border)] border-t-[var(--color-text-secondary)] rounded-full animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
