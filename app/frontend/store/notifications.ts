import { create } from "zustand";
import { tr } from "@/store/translate";
import type { Severity } from "@/lib/utils";
import { genId } from "@/lib/id";

// Aliased to the app-wide Severity union (see lib/utils) so toast + notification
// severities stay in lockstep.
export type NotificationType = Severity;
type NotificationCategory = "upload" | "download" | "server" | "system";

export interface AppNotification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
}

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  add: (n: Omit<AppNotification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  remove: (id: string) => void;
  clearAll: () => void;
}

const MAX_NOTIFICATIONS = 50;

function countUnread(list: AppNotification[]): number {
  return list.filter((x) => !x.read).length;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,

  add: (n) => {
    const id = genId("notif");
    set((s) => {
      const next = [{ ...n, id, timestamp: Date.now(), read: false }, ...s.notifications].slice(
        0,
        MAX_NOTIFICATIONS,
      );
      return {
        notifications: next,
        unreadCount: countUnread(next),
      };
    });
  },

  markRead: (id) => {
    set((s) => {
      const next = s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n));
      return {
        notifications: next,
        unreadCount: countUnread(next),
      };
    });
  },

  markAllRead: () => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    }));
  },

  remove: (id) => {
    set((s) => {
      const next = s.notifications.filter((n) => n.id !== id);
      return {
        notifications: next,
        unreadCount: countUnread(next),
      };
    });
  },

  clearAll: () => {
    set({ notifications: [], unreadCount: 0 });
  },
}));

// Convenience helpers
export const notifications = {
  uploadComplete: (filename: string) =>
    useNotificationStore.getState().add({
      type: "success",
      category: "upload",
      title: tr("notifications.uploadComplete"),
      message: filename,
    }),
  uploadFailed: (filename: string, error: string) =>
    useNotificationStore.getState().add({
      type: "error",
      category: "upload",
      title: tr("notifications.uploadFailed"),
      message: `${filename}: ${error}`,
    }),
  downloadComplete: (filename: string) =>
    useNotificationStore.getState().add({
      type: "success",
      category: "download",
      title: tr("notifications.downloadComplete"),
      message: filename,
    }),
  downloadFailed: (filename: string, error: string) =>
    useNotificationStore.getState().add({
      type: "error",
      category: "download",
      title: tr("notifications.downloadFailed"),
      message: `${filename}: ${error}`,
    }),
  serverError: (message: string) =>
    useNotificationStore.getState().add({
      type: "error",
      category: "server",
      title: tr("notifications.serverError"),
      message,
    }),
  serverReconnected: () =>
    useNotificationStore.getState().add({
      type: "success",
      category: "server",
      title: tr("notifications.connectionRestored"),
      message: tr("notifications.reconnectedBody"),
    }),
  systemWarning: (message: string) =>
    useNotificationStore.getState().add({
      type: "warning",
      category: "system",
      title: tr("notifications.warning"),
      message,
    }),
};
