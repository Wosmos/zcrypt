"use client";

import { useEffect, useState } from "react";
import { getLinkedAccounts, unlinkAccount, getOAuthURL, type LinkedAccountsResponse } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Github, Link2, X } from "lucide-react";
import { GoogleIcon } from "@/components/icons/google";
import { cn } from "@/lib/utils";

export function LinkedAccounts() {
  const { accessToken } = useAuthStore();
  const [data, setData] = useState<LinkedAccountsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [unlinking, setUnlinking] = useState<string | null>(null);

  const refresh = () => {
    if (!accessToken) return;
    getLinkedAccounts(accessToken)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, [accessToken]);

  const handleUnlink = async (provider: string) => {
    if (!accessToken) return;
    setUnlinking(provider);
    try {
      await unlinkAccount(accessToken, provider);
      toast.success(`${provider} unlinked`);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unlink failed");
    } finally {
      setUnlinking(null);
    }
  };

  if (loading) {
    return (
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">Linked Accounts</h2>
        </div>
        <div className="p-5 text-center text-sm text-[var(--color-text-muted)]">Loading...</div>
      </section>
    );
  }

  const providers = [
    { id: "google", name: "Google", icon: <GoogleIcon className="h-4 w-4" /> },
    { id: "github", name: "GitHub", icon: <Github className="h-4 w-4" /> },
  ];

  const linked = data?.providers ?? [];

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
        <Link2 className="h-4 w-4 text-[var(--color-text-muted)]" />
        <h2 className="text-sm font-semibold">Linked Accounts</h2>
      </div>
      <div className="p-5 space-y-3">
        {providers.map(({ id, name, icon }) => {
          const connection = linked.find((p) => p.provider === id);
          const isLinked = !!connection;
          return (
            <div
              key={id}
              className={cn(
                "flex items-center gap-3 px-3.5 py-3 rounded-xl border transition-colors",
                isLinked
                  ? "border-emerald-500/15 bg-emerald-500/5"
                  : "border-[var(--color-border)]"
              )}
            >
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-[var(--color-surface-1)] flex-shrink-0">
                {icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{name}</p>
                <p className="text-[11px] text-[var(--color-text-muted)] truncate">
                  {isLinked ? connection.provider_email : "Not connected"}
                </p>
              </div>
              {isLinked ? (
                <button
                  onClick={() => handleUnlink(id)}
                  disabled={unlinking === id}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-red-500 transition-colors disabled:opacity-50"
                >
                  {unlinking === id ? (
                    <span className="h-3.5 w-3.5 border border-[var(--color-border)] border-t-[var(--color-text-secondary)] rounded-full animate-spin" />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : (
                <button
                  onClick={() => { window.location.href = getOAuthURL(id); }}
                  className="text-xs font-medium text-[var(--color-accent)] hover:underline transition-colors"
                >
                  Link
                </button>
              )}
            </div>
          );
        })}
        {data && !data.has_password && linked.length <= 1 && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Add a password or link another provider to ensure you can always access your account.
          </p>
        )}
      </div>
    </section>
  );
}
