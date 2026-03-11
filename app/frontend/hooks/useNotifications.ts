"use client";

import { useEffect, useRef, useCallback } from "react";

export function useNotifications() {
  const permissionRef = useRef<NotificationPermission>("default");

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    permissionRef.current = Notification.permission;
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;

    const result = await Notification.requestPermission();
    permissionRef.current = result;
    return result === "granted";
  }, []);

  const notify = useCallback((title: string, options?: NotificationOptions & { always?: boolean }) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    // By default only notify when tab is not focused, unless always=true
    if (!options?.always && !document.hidden) return;

    const { always: _, ...notifOptions } = options || {};
    const n = new Notification(title, {
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      ...notifOptions,
    });

    // Auto-close after 5s
    setTimeout(() => n.close(), 5000);

    // Focus window on click
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }, []);

  const isSupported = typeof window !== "undefined" && "Notification" in window;
  const isGranted = typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted";

  return { notify, requestPermission, isSupported, isGranted };
}
