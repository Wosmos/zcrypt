"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { listSessions, revokeOtherSessions, revokeSession, type SessionInfo } from "@/lib/auth-api";
import { describeUserAgent } from "@/lib/user-agent";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SettingGroup } from "@/components/settings/settings-primitives";
import { LogOut, Monitor, MonitorSmartphone, Smartphone } from "@/lib/icons";
import { cn, formatDateTime, formatRelativeTime } from "@/lib/utils";

const NO_SESSIONS: SessionInfo[] = [];

function DeviceIcon({ ua, className }: { ua: string; className?: string }) {
  const { kind } = describeUserAgent(ua);
  const Icon = kind === "phone" ? Smartphone : kind === "desktop" ? Monitor : MonitorSmartphone;
  return <Icon className={className} />;
}

function deviceTitle(ua: string): string {
  const { browser, os } = describeUserAgent(ua);
  if (browser === "Unknown" && os === "Unknown") return "Unknown device";
  if (os === "Unknown") return browser;
  if (browser === "Unknown") return os;
  return `${browser} on ${os}`;
}

export function SignedInDevices() {
  const hasToken = useAuthStore((s) => !!s.accessToken);
  const query = useQuery({
    queryKey: qk.sessions,
    queryFn: () => listSessions(useAuthStore.getState().accessToken ?? ""),
    enabled: hasToken,
  });
  const sessions = query.data ?? NO_SESSIONS;
  const others = sessions.filter((s) => !s.current);

  const [revoking, setRevoking] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<SessionInfo | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [revokingAll, setRevokingAll] = useState(false);

  const refresh = () => void queryClient.invalidateQueries({ queryKey: qk.sessions });

  const signOutOne = async () => {
    const target = confirmTarget;
    const token = useAuthStore.getState().accessToken;
    if (!target || !token) return;
    setRevoking(target.id);
    try {
      await revokeSession(token, target.id);
      toast.success(`${deviceTitle(target.user_agent)} signed out`);
      setConfirmTarget(null);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign that device out");
    } finally {
      setRevoking(null);
    }
  };

  const signOutOthers = async () => {
    const token = useAuthStore.getState().accessToken;
    if (!token) return;
    setRevokingAll(true);
    try {
      const { revoked } = await revokeOtherSessions(token);
      toast.success(
        revoked === 1 ? "Signed out 1 other device" : `Signed out ${revoked} other devices`,
      );
      setConfirmAll(false);
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign the other devices out");
    } finally {
      setRevokingAll(false);
    }
  };

  if (query.isPending) {
    return (
      <SettingGroup label="Signed-in devices">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="h-9 w-9 flex-shrink-0 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-36 rounded-md" />
              <Skeleton className="h-3 w-52 rounded-md" />
            </div>
          </div>
        ))}
      </SettingGroup>
    );
  }

  if (query.isError) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center"
      >
        <MonitorSmartphone className="mx-auto mb-2 h-7 w-7 text-[var(--color-text-muted)]" />
        <p className="text-sm text-[var(--color-text-secondary)]">
          Could not load your signed-in devices
        </p>
        <button
          type="button"
          onClick={() => query.refetch()}
          className="mt-3 text-xs font-medium text-[var(--color-text)] underline underline-offset-2"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TooltipProvider delayDuration={300}>
        <SettingGroup
          label="Signed-in devices"
          footnote="A device you sign out loses access right away and needs your password to get back in. Each sign-in also lasts at most 7 days without use."
        >
          {sessions.map((s) => {
            const busy = revoking === s.id;
            return (
              <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={cn(
                    "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ring-1",
                    s.current
                      ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-[var(--color-accent)]/20"
                      : "bg-[var(--color-surface)] text-[var(--color-text-muted)] ring-[var(--color-border)]",
                  )}
                >
                  <DeviceIcon ua={s.user_agent} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-text)]">
                    <span className="truncate">{deviceTitle(s.user_agent)}</span>
                    {s.current && (
                      <span className="flex-shrink-0 rounded-full bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
                    <span className="font-mono">{s.ip || "Unknown network"}</span>
                    {" · "}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-default tabular-nums">
                          {s.current ? "Active now" : `Active ${formatRelativeTime(s.last_active)}`}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        Signed in {formatDateTime(s.started_at)}
                      </TooltipContent>
                    </Tooltip>
                  </p>
                </div>
                {!s.current &&
                  (busy ? (
                    <span className="flex h-8 w-8 items-center justify-center text-[var(--color-text-muted)]">
                      <LogoSpinner size={14} speed="fast" />
                    </span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmTarget(s)}
                      className="flex-shrink-0 hover:text-red-500"
                    >
                      <LogOut className="h-3.5 w-3.5" />
                      Sign out
                    </Button>
                  ))}
              </div>
            );
          })}
        </SettingGroup>
      </TooltipProvider>

      {others.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/40 p-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-[var(--color-text)]">Sign out everywhere else</p>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
              Ends every session except this one. Use it if a phone or laptop went missing.
            </p>
          </div>
          <Button variant="danger" onClick={() => setConfirmAll(true)} className="sm:self-center">
            <LogOut className="h-4 w-4" />
            Sign out {others.length === 1 ? "1 device" : `${others.length} devices`}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
        destructive
        title="Sign this device out?"
        description={
          confirmTarget
            ? `${deviceTitle(confirmTarget.user_agent)} (${confirmTarget.ip || "unknown network"}) will be signed out immediately.`
            : ""
        }
        confirmLabel="Sign out"
        loading={!!revoking}
        onConfirm={() => void signOutOne()}
      />

      <ConfirmDialog
        open={confirmAll}
        onOpenChange={setConfirmAll}
        destructive
        title="Sign out every other device?"
        description="Every session except this one ends immediately. Those devices will need your password to sign back in."
        confirmLabel="Sign out others"
        loading={revokingAll}
        onConfirm={() => void signOutOthers()}
      />
    </div>
  );
}
