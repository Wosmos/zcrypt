"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminCreateToken, adminDeleteToken, adminToggleTokenScope } from "@/lib/api";
import { toast } from "@/store/toast";
import { cn } from "@/lib/utils";
import { Key, Trash2, Globe, User, Plus, X } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import type { PlatformTokenInfo } from "@/types";

const platformNames: Record<string, string> = {
  github: "GitHub",
  gitlab: "GitLab",
  huggingface: "Hugging Face",
};

const platformShort: Record<string, string> = {
  github: "GH",
  gitlab: "GL",
  huggingface: "HF",
};

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

  const scopeBadgeClass = (t: PlatformTokenInfo) => {
    const isOwner = t.user_id === currentUserId;
    const isGlobalResolved = resolveGlobal(t);
    return cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
      isGlobalResolved
        ? "border-[var(--color-accent)]/20 bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
        : isOwner
          ? "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
    );
  };

  return (
    <>
      <section className="panel overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-[var(--color-text)]">Platform tokens</h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              {tokens.length} token{tokens.length !== 1 ? "s" : ""} registered
            </p>
          </div>
          <Button
            variant={showForm ? "secondary" : "primary"}
            size="sm"
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showForm ? "Cancel" : "Add token"}
          </Button>
        </div>

        {showForm && (
          <div className="animate-fade-in space-y-4 border-b border-[var(--color-border)] bg-[var(--color-surface-1)]/50 p-5">
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="sm:w-44">
                <Select value={platform} onValueChange={setPlatform}>
                  <SelectTrigger className="h-10" aria-label="Platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="github">GitHub</SelectItem>
                    <SelectItem value="gitlab">GitLab</SelectItem>
                    <SelectItem value="huggingface">Hugging Face</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={isGlobal}
                  onChange={(e) => setIsGlobal(e.target.checked)}
                  className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                />
                <span className="text-sm text-[var(--color-text-secondary)]">
                  Global token <span className="hidden sm:inline">(available to all users)</span>
                </span>
              </label>
              <Button onClick={handleCreate} disabled={creating || !token.trim()} className="w-full sm:w-auto">
                {creating ? (
                  <span className="flex items-center gap-2">
                    <LogoSpinner size={14} speed="fast" />
                    Adding…
                  </span>
                ) : (
                  "Add token"
                )}
              </Button>
            </div>
          </div>
        )}

        {tokens.length === 0 ? (
          <EmptyState
            icon={<Key className="h-7 w-7 text-[var(--color-text-muted)]" />}
            title="No platform tokens"
            description="Add a GitHub, GitLab, or Hugging Face access token to enable encrypted storage for your users."
          />
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {tokens.map((t) => {
              const isOwner = t.user_id === currentUserId;
              const isGlobalResolved = resolveGlobal(t);
              return (
                <div
                  key={t.id}
                  className="flex items-center gap-2 px-3 py-3 transition-colors hover:bg-[var(--color-surface-1)] sm:gap-3 sm:px-5"
                >
                  <div className="hidden h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-surface-2)] sm:flex">
                    <Key className="h-4 w-4 text-[var(--color-text-muted)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <span className="truncate text-sm font-medium text-[var(--color-text)]">
                        <span className="sm:hidden">{platformShort[t.platform] ?? t.platform}</span>
                        <span className="hidden sm:inline">{platformNames[t.platform] ?? t.platform}</span>
                      </span>
                      <span className="truncate text-xs text-[var(--color-text-muted)]">@{t.username}</span>
                    </div>
                    <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
                      {new Date(t.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {isOwner ? (
                    <button
                      onClick={() => handleToggleScope(t)}
                      title={isGlobalResolved ? "Click to make local (owner-only)" : "Click to make global (all users)"}
                      aria-label={isGlobalResolved ? "Make token local" : "Make token global"}
                      className={cn(
                        scopeBadgeClass(t),
                        "cursor-pointer hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                      )}
                    >
                      {isGlobalResolved ? <Globe className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">{isGlobalResolved ? "Global" : "Local"}</span>
                    </button>
                  ) : (
                    <span className={scopeBadgeClass(t)}>
                      {isGlobalResolved ? <Globe className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                      <span className="hidden sm:inline">{isGlobalResolved ? "Global" : "Local"}</span>
                    </span>
                  )}
                  {isOwner && (
                    <IconButton
                      icon={Trash2}
                      label="Delete token"
                      variant="ghost"
                      onClick={() => setDeleteTarget(t)}
                      disabled={deleting === t.id}
                      className="flex-shrink-0 hover:bg-red-500/10 hover:text-red-500"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
        destructive
        title="Delete token?"
        description={
          deleteTarget
            ? `Delete the ${platformNames[deleteTarget.platform] ?? deleteTarget.platform} token for @${deleteTarget.username}?${deleteTarget.is_global ? " This is a global token — removing it will affect all users." : ""}`
            : ""
        }
        confirmLabel="Delete token"
        loading={deleting === deleteTarget?.id}
        onConfirm={executeDelete}
      />
    </>
  );
}
