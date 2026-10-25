"use client";

import { useEffect } from "react";
import { useAlertEvents } from "@/hooks/useAlertEvents";
import { registerServiceWorker } from "@/lib/service-worker";

/** Registers the notification service worker and raises sign-in and storage alerts. */
export function BackgroundAlerts() {
  useAlertEvents();
  useEffect(() => {
    void registerServiceWorker();
  }, []);
  return null;
}
