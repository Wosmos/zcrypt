"use client";

import { useEffect, useState } from "react";
import { getLinkedAccounts, unlinkAccount, getOAuthURL, type LinkedAccountsResponse } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Github, Link2, X } from "@/lib/icons";
import { Section } from "@/components/ui/section";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoSpinner } from "@/components/ui/logo-spinner";
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

  const providers = [
    { id: "google", name: "Google", icon: <GoogleIcon className="h-4 w-4" /> },
    { id: "github", name: "GitHub", icon: <Github className="h-4 w-4" /> },
  ];

  const linked = data?.providers ?? [];

  return (
    <div className="panel p-6">
      <Section
        title="Linked accounts"
        description="Sign in with a connected identity provider."
      >
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] px-3.5 py-3"
              >
                <Skeleton className="h-9 w-9 flex-shrink-0 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-20 rounded-md" />
                  <Skeleton className="h-3 w-32 rounded-md" />
                </div>
                <Skeleton className="h-4 w-10 rounded-md" />
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {providers.map(({ id, name, icon }) => {
              const connection = linked.find((p) => p.provider === id);
              const isLinked = !!connection;
              return (
                <div
                  key={id}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors",
                    isLinked
                      ? "border-[var(--color-accent)]/15 bg-[var(--color-accent)]/5"
                      : "border-[var(--color-border)]"
                  )}
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-1)] ring-1 ring-[var(--color-border)]">
                    {icon}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-[var(--color-text)]">{name}</p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">
                      {isLinked ? connection.provider_email : "Not connected"}
                    </p>
                  </div>
                  {isLinked ? (
                    unlinking === id ? (
                      <span className="flex h-9 w-9 items-center justify-center text-[var(--color-text-muted)]">
                        <LogoSpinner size={14} speed="fast" />
                      </span>
                    ) : (
                      <IconButton
                        icon={X}
                        label={`Unlink ${name}`}
                        variant="ghost"
                        iconClassName="h-3.5 w-3.5"
                        onClick={() => handleUnlink(id)}
                        className="text-[var(--color-text-muted)] hover:text-red-500"
                      />
                    )
                  ) : (
                    <button
                      type="button"
                      onClick={() => { window.location.href = getOAuthURL(id); }}
                      className="rounded text-xs font-medium text-[var(--color-accent)] outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40"
                    >
                      Link
                    </button>
                  )}
                </div>
              );
            })}
            {data && !data.has_password && linked.length <= 1 && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-2.5">
                <Link2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Add a password or link another provider to ensure you can always access your account.
                </p>
              </div>
            )}
          </div>
        )}
      </Section>
    </div>
  );
}
