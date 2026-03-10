"use client";

import { useEffect, useState } from "react";
import { getUserActivity, type AuditEvent } from "@/lib/auth-api";
import { useAuthStore } from "@/store/auth";
import {
  LogIn,
  LogOut,
  UserPlus,
  Key,
  Link2,
  Shield,
  Activity,
} from "lucide-react";

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

  if (loading) {
    return (
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">Security Activity</h2>
        </div>
        <div className="p-5 text-center text-sm text-[var(--color-text-muted)]">Loading...</div>
      </section>
    );
  }

  if (events.length === 0) {
    return (
      <section className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-sm font-semibold">Security Activity</h2>
        </div>
        <div className="p-5 text-center text-sm text-[var(--color-text-muted)]">No activity yet</div>
      </section>
    );
  }

  return (
    <section className="card overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
        <Activity className="h-4 w-4 text-[var(--color-text-muted)]" />
        <h2 className="text-sm font-semibold">Security Activity</h2>
      </div>
      <div className="divide-y divide-[var(--color-border)]">
        {events.map((event) => {
          const Icon = eventIcons[event.event_type] ?? Shield;
          const label = eventLabels[event.event_type] ?? event.event_type.replace(/_/g, " ");
          return (
            <div key={event.id} className="flex items-center gap-3 px-5 py-3">
              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--color-surface-1)] text-[var(--color-text-muted)] flex-shrink-0">
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{label}</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">{event.ip}</p>
              </div>
              <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums flex-shrink-0">
                {formatRelativeTime(event.created_at)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
