"use client";

import { useEffect } from "react";
import { subscribeEvents } from "@/lib/event-stream";
import { useTheme, type RemotePreference } from "@/components/providers/theme-provider";

/** Repaint when the account theme changes on another device, and re-check it after the stream was down. */
export function useThemeEvents() {
  const { applyRemotePreference, reloadPreference } = useTheme();
  useEffect(
    () =>
      subscribeEvents(
        {
          preferences: (e) => {
            try {
              applyRemotePreference(JSON.parse(e.data) as RemotePreference);
            } catch {
              return;
            }
          },
        },
        {
          onOpen: (reconnected) => {
            if (reconnected) reloadPreference();
          },
        },
      ),
    [applyRemotePreference, reloadPreference],
  );
}
