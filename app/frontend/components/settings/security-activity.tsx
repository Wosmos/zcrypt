"use client";

import { useEffect, useState } from "react";
import { getUserActivity, type AuditEvent } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import { Section } from "@/components/ui/section";
import { SkeletonRow } from "@/components/ui/skeletons";
import {
  LogIn,
  LogOut,
  UserPlus,
  Key,
  Link2,
  Shield,
  Activity,
} from "@/lib/icons";

const eventLabels: Record<string, string> = {
  login: "Signed in",
  login_failed: "Failed sign in attempt",
  register: "Account created",
  logout: "Signed out",
  oauth_login: "OAuth sign in",
  oauth_register: "OAuth sign up",
  oauth_link: "OAuth linked",
  oauth_unlink: "OAuth unlinked",
  magic_link_sent: "Magic link sent",
  magic_link_used: "Magic link sign in",
  "2fa_enable": "2FA enabled",
  "2fa_disable": "2FA disabled",
  email_verify: "Email verified",
  password_reset_requested: "Password reset requested",
  password_reset: "Password reset",
};

const eventIcons: Record<string, typeof Shield> = {
  login: LogIn,
  login_failed: LogIn,
  register: UserPlus,
  logout: LogOut,
  oauth_login: LogIn,
  oauth_register: UserPlus,
  oauth_link: Link2,
  oauth_unlink: Link2,
  magic_link_sent: Key,
  magic_link_used: Key,
  "2fa_enable": Shield,
  "2fa_disable": Shield,
};

function formatRelativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function SecurityActivity() {
  const { accessToken } = useAuthStore();
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!accessToken) return;
    getUserActivity(accessToken)
      .then(setEvents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [accessToken]);

  return (
    <div className="panel p-6">
      <Section
        title="Security activity"
        description="Recent authentication events on your account."
      >
        {loading ? (
          <div className="divide-y divide-[var(--color-border)]">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonRow key={i} />
            ))}
          </div>
        ) : events.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--color-border)] px-4 py-10 text-center">
            <Activity className="mx-auto mb-2 h-7 w-7 text-[var(--color-text-muted)]" />
            <p className="text-sm text-[var(--color-text-secondary)]">No activity yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--color-border)]">
            {events.map((event) => {
              const Icon = eventIcons[event.event_type] ?? Shield;
              const label = eventLabels[event.event_type] ?? event.event_type.replace(/_/g, " ");
              return (
                <li key={event.id} className="flex items-center gap-3 py-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-1)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]">
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">{label}</p>
                    <p className="truncate text-xs text-[var(--color-text-muted)]">{event.ip}</p>
                  </div>
                  <span className="flex-shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">
                    {formatRelativeTime(event.created_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
