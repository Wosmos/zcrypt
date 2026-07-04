import { describe, it, expect, beforeEach } from "vitest";
import { useNotificationStore, notifications } from "@/store/notifications";

describe("useNotificationStore", () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  it("starts empty with zero unread", () => {
    const s = useNotificationStore.getState();
    expect(s.notifications).toEqual([]);
    expect(s.unreadCount).toBe(0);
  });

  it("add() unshifts a new unread notification with a generated id and timestamp", () => {
    useNotificationStore.getState().add({
      type: "success",
      category: "upload",
      title: "Upload complete",
      message: "file.txt",
    });

    const s = useNotificationStore.getState();
    expect(s.notifications).toHaveLength(1);
    expect(s.unreadCount).toBe(1);
    const n = s.notifications[0];
    expect(n.id).toMatch(/^notif_\d+_\d+$/);
    expect(n.read).toBe(false);
    expect(typeof n.timestamp).toBe("number");
    expect(n.type).toBe("success");
    expect(n.category).toBe("upload");
    expect(n.title).toBe("Upload complete");
    expect(n.message).toBe("file.txt");
  });

  it("add() puts the newest notification at the front", () => {
    useNotificationStore.getState().add({ type: "info", category: "system", title: "one", message: "" });
    useNotificationStore.getState().add({ type: "info", category: "system", title: "two", message: "" });
    const titles = useNotificationStore.getState().notifications.map((n) => n.title);
    expect(titles).toEqual(["two", "one"]);
  });

  it("add() caps the list at 50, dropping the oldest", () => {
    for (let i = 0; i < 55; i++) {
      useNotificationStore.getState().add({
        type: "info",
        category: "system",
        title: `n${i}`,
        message: "",
      });
    }
    const s = useNotificationStore.getState();
    expect(s.notifications).toHaveLength(50);
    // Most recent (n54) survives; the oldest 5 (n0..n4) were pushed out.
    expect(s.notifications[0].title).toBe("n54");
    expect(s.notifications.some((n) => n.title === "n0")).toBe(false);
    expect(s.notifications.some((n) => n.title === "n4")).toBe(false);
    expect(s.notifications.some((n) => n.title === "n5")).toBe(true);
  });

  it("markRead() flips a single notification and recomputes unreadCount", () => {
    useNotificationStore.getState().add({ type: "info", category: "system", title: "a", message: "" });
    useNotificationStore.getState().add({ type: "info", category: "system", title: "b", message: "" });
    const [second, first] = useNotificationStore.getState().notifications;
    expect(second.title).toBe("b");

    useNotificationStore.getState().markRead(first.id);
    const s = useNotificationStore.getState();
    expect(s.notifications.find((n) => n.id === first.id)?.read).toBe(true);
    expect(s.notifications.find((n) => n.id === second.id)?.read).toBe(false);
    expect(s.unreadCount).toBe(1);
  });

  it("markRead() with an unknown id is a no-op", () => {
    useNotificationStore.getState().add({ type: "info", category: "system", title: "a", message: "" });
    useNotificationStore.getState().markRead("does-not-exist");
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it("markAllRead() clears every unread flag", () => {
    useNotificationStore.getState().add({ type: "info", category: "system", title: "a", message: "" });
    useNotificationStore.getState().add({ type: "info", category: "system", title: "b", message: "" });
    useNotificationStore.getState().markAllRead();
    const s = useNotificationStore.getState();
    expect(s.unreadCount).toBe(0);
    expect(s.notifications.every((n) => n.read)).toBe(true);
  });

  it("remove() drops a notification and recomputes unreadCount", () => {
    useNotificationStore.getState().add({ type: "info", category: "system", title: "a", message: "" });
    useNotificationStore.getState().add({ type: "info", category: "system", title: "b", message: "" });
    const [second] = useNotificationStore.getState().notifications;

    useNotificationStore.getState().remove(second.id);
    const s = useNotificationStore.getState();
    expect(s.notifications).toHaveLength(1);
    expect(s.notifications[0].title).toBe("a");
    expect(s.unreadCount).toBe(1);
  });

  it("remove() with an unknown id is a no-op", () => {
    useNotificationStore.getState().add({ type: "info", category: "system", title: "a", message: "" });
    useNotificationStore.getState().remove("does-not-exist");
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
  });

  it("clearAll() empties the list and resets unreadCount", () => {
    useNotificationStore.getState().add({ type: "info", category: "system", title: "a", message: "" });
    useNotificationStore.getState().clearAll();
    const s = useNotificationStore.getState();
    expect(s.notifications).toEqual([]);
    expect(s.unreadCount).toBe(0);
  });
});

describe("notifications convenience helpers", () => {
  beforeEach(() => {
    useNotificationStore.getState().clearAll();
  });

  function last() {
    return useNotificationStore.getState().notifications[0];
  }

  it("uploadComplete", () => {
    notifications.uploadComplete("photo.png");
    const n = last();
    expect(n).toMatchObject({
      type: "success",
      category: "upload",
      title: "Upload complete",
      message: "photo.png",
    });
  });

  it("uploadFailed", () => {
    notifications.uploadFailed("photo.png", "network error");
    const n = last();
    expect(n).toMatchObject({
      type: "error",
      category: "upload",
      title: "Upload failed",
      message: "photo.png: network error",
    });
  });

  it("downloadComplete", () => {
    notifications.downloadComplete("archive.zip");
    const n = last();
    expect(n).toMatchObject({
      type: "success",
      category: "download",
      title: "Download complete",
      message: "archive.zip",
    });
  });

  it("downloadFailed", () => {
    notifications.downloadFailed("archive.zip", "timeout");
    const n = last();
    expect(n).toMatchObject({
      type: "error",
      category: "download",
      title: "Download failed",
      message: "archive.zip: timeout",
    });
  });

  it("serverError", () => {
    notifications.serverError("500 from /api/files");
    const n = last();
    expect(n).toMatchObject({
      type: "error",
      category: "server",
      title: "Server error",
      message: "500 from /api/files",
    });
  });

  it("serverReconnected", () => {
    notifications.serverReconnected();
    const n = last();
    expect(n).toMatchObject({
      type: "success",
      category: "server",
      title: "Connection restored",
      message: "Server connection re-established",
    });
  });

  it("systemWarning", () => {
    notifications.systemWarning("Storage almost full");
    const n = last();
    expect(n).toMatchObject({
      type: "warning",
      category: "system",
      title: "Warning",
      message: "Storage almost full",
    });
  });
});
