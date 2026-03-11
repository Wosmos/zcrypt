import { create } from "zustand";

export type NotificationType = "success" | "error" | "warning" | "info";
export type NotificationCategory = "upload" | "download" | "server" | "system";

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

let counter = 0;
const MAX_NOTIFICATIONS = 50;

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  unreadCount: 0,

  add: (n) => {
    const id = `notif_${++counter}_${Date.now()}`;
    set((s) => {
      const next = [
        { ...n, id, timestamp: Date.now(), read: false },
        ...s.notifications,
      ].slice(0, MAX_NOTIFICATIONS);
      return {
        notifications: next,
        unreadCount: next.filter((x) => !x.read).length,
      };
    });
  },

  markRead: (id) => {
    set((s) => {
      const next = s.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      );
      return {
        notifications: next,
        unreadCount: next.filter((x) => !x.read).length,
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
        unreadCount: next.filter((x) => !x.read).length,
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
      title: "Upload complete",
      message: filename,
    }),
  uploadFailed: (filename: string, error: string) =>
    useNotificationStore.getState().add({
      type: "error",
      category: "upload",
      title: "Upload failed",
      message: `${filename}: ${error}`,
    }),
  downloadComplete: (filename: string) =>
    useNotificationStore.getState().add({
      type: "success",
      category: "download",
      title: "Download complete",
      message: filename,
    }),
  downloadFailed: (filename: string, error: string) =>
    useNotificationStore.getState().add({
      type: "error",
      category: "download",
      title: "Download failed",
      message: `${filename}: ${error}`,
    }),
  serverError: (message: string) =>
    useNotificationStore.getState().add({
      type: "error",
      category: "server",
      title: "Server error",
      message,
    }),
  serverReconnected: () =>
    useNotificationStore.getState().add({
      type: "success",
      category: "server",
      title: "Connection restored",
      message: "Server connection re-established",
    }),
  systemWarning: (message: string) =>
    useNotificationStore.getState().add({
      type: "warning",
      category: "system",
      title: "Warning",
      message,
    }),
};
