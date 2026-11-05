"use client";

import { useEffect } from "react";
import { useAlertEvents } from "@/hooks/useAlertEvents";
import { useThemeEvents } from "@/hooks/useThemeEvents";
import { registerServiceWorker } from "@/lib/service-worker";

/** Registers the notification service worker, raises sign-in and storage alerts, and keeps the theme in sync. */
export function BackgroundAlerts() {
  useAlertEvents();
  useThemeEvents();
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
