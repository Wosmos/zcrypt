"use client";

import { useEffect, useState } from "react";
import { detectDevice } from "@/components/marketing/download/download-cta";
import type { DetectedDevice } from "@/lib/releases";

export type OsLabel = { os: DetectedDevice | null; label: string; href: string };

const LABELS: Record<DetectedDevice, { label: string; href: string }> = {
  macos: { label: "Download for Mac", href: "/download?os=mac" },
  windows: { label: "Download for Windows", href: "/download?os=windows" },
  linux: { label: "Download for Linux", href: "/download?os=linux" },
  android: { label: "Get the Android app", href: "/download?os=android" },
  ios: { label: "Open in Safari, no app needed", href: "/register" },
};

const FALLBACK: OsLabel = { os: null, label: "Download the app", href: "/download" };

/** The OS download button's label and link, resolved after mount so SSR and hydration agree. */
export function useOsLabel(): OsLabel {
  const [value, setValue] = useState<OsLabel>(FALLBACK);
  useEffect(() => {
    const os = detectDevice();
    if (os) setValue({ os, ...LABELS[os] });
  }, []);
  return value;
}
