"use client";

import { useEffect } from "react";
import { useAlertEvents } from "@/hooks/useAlertEvents";
import { useUserEvents } from "@/hooks/useUserEvents";
import { useBackupNotifications } from "@/hooks/useBackupNotifications";
import { useThemeEvents } from "@/hooks/useThemeEvents";
import { registerServiceWorker } from "@/lib/service-worker";

/** Registers the notification service worker, raises storage and Space alerts, and keeps the theme in sync. */
export function BackgroundAlerts() {
  useAlertEvents();
  useUserEvents();
  useThemeEvents();
  useBackupNotifications();
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
