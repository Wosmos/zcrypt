"use client";

import { useEffect } from "react";
import { calibrateDeviceProfile } from "@/lib/device-profile";

/**
 * Marks <html> with `data-app` while the authenticated app shell is mounted.
 *
 * Color themes are scoped to `html[data-app][data-theme]` so that (a) themed
 * tokens reach portaled overlays in <body> (dropdowns, dialogs, popovers —
 * which render outside .app-shell), and (b) marketing/auth pages, which never
 * mount this, keep the base palette even if a theme is stored. AuthGuard hides
 * the shell behind a spinner until mount, so setting this in an effect causes
 * no flash of the unthemed palette.
 */
export function AppScope() {
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.app = "";
    // One-time device capability calibration (fire-and-forget, idempotent). A
    // quick crypto micro-benchmark upgrades the tuning tier when the device is
    // faster than the RAM/core heuristic guessed — matters most on iPhones,
    // where Safari hides navigator.deviceMemory so the heuristic under-rates them.
    void calibrateDeviceProfile();
    return () => {
      delete el.dataset.app;
    };
  }, []);
  return null;
}
