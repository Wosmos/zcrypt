"use client";

import { useState, useRef } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { Bell, BellOff, CheckCircle2, AlertCircle, AlertTriangle, Info, X, Check, Trash2 } from "@/lib/icons";
import { useNotificationStore, type NotificationType } from "@/store/notifications";
import { useNotifications } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const typeIcons: Record<NotificationType, typeof CheckCircle2> = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const typeColors: Record<NotificationType, string> = {
  success: "text-cyan-500",
  error: "text-red-500",
  warning: "text-amber-500",
  info: "text-blue-500",
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { notifications, unreadCount, markRead, markAllRead, remove, clearAll } = useNotificationStore();
  const { requestPermission, isSupported, isGranted } = useNotifications();

  // Close on outside click
  useClickOutside(dropdownRef, () => setOpen(false), open);

  const hasErrors = notifications.some((n) => n.type === "error" && !n.read);

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex items-center justify-center h-10 w-10 rounded-full transition-colors",
          hasErrors
            ? "text-red-500 bg-red-500/10"
            : unreadCount > 0
              ? "text-[var(--color-accent)] bg-[var(--color-accent)]/10"
              : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)]"
        )}
        title={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className={cn(
            "absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full text-[10px] font-bold text-white",
            hasErrors ? "bg-red-500" : "bg-[var(--color-accent)]"
          )}>
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 max-h-[420px] rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl overflow-hidden z-50 animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-semibold">Notifications</h3>
            <div className="flex items-center gap-1">
              {/* Push notification toggle */}
              {isSupported && (
                <button
                  onClick={requestPermission}
                  className={cn(
                    "flex items-center justify-center h-7 w-7 rounded-lg transition-colors",
                    isGranted
                      ? "text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-1)]"
                  )}
                  title={isGranted ? "Push notifications enabled" : "Enable push notifications"}
                >
                  {isGranted ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                </button>
              )}
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-2 py-1 rounded-lg hover:bg-[var(--color-surface-1)] transition-colors"
                  title="Mark all as read"
                >
                  <Check className="h-3 w-3" />
                  Read all
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => { clearAll(); setOpen(false); }}
                  className="flex items-center justify-center h-7 w-7 rounded-lg text-[var(--color-text-muted)] hover:text-red-500 hover:bg-red-500/10 transition-colors"
                  title="Clear all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Notification list */}
          <div className="overflow-y-auto max-h-[350px]">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <Bell className="h-8 w-8 text-[var(--color-text-muted)] mb-2 opacity-30" />
                <p className="text-sm text-[var(--color-text-muted)]">No notifications yet</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5 opacity-60">
                  Upload and download activity will appear here
                </p>
              </div>
            ) : (
              notifications.map((n) => {
                const Icon = typeIcons[n.type];
                return (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 border-b border-[var(--color-border)] last:border-0 transition-colors cursor-pointer hover:bg-[var(--color-surface-1)]",
                      !n.read && "bg-[var(--color-accent)]/[0.03]"
                    )}
                    onClick={() => markRead(n.id)}
                  >
                    <Icon className={cn("h-4 w-4 mt-0.5 flex-shrink-0", typeColors[n.type])} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn("text-sm font-medium truncate", !n.read && "text-[var(--color-text)]")}>
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] flex-shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] truncate mt-0.5">
                        {n.message}
                      </p>
                      <p className="text-[10px] text-[var(--color-text-muted)] opacity-60 mt-1">
                        {timeAgo(n.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); remove(n.id); }}
                      className="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text)] opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
