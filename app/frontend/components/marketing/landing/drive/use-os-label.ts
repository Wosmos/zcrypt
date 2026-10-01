"use client";

import { useEffect, useState } from "react";
import { detectDevice } from "@/components/marketing/download/download-cta";
import type { DetectedDevice } from "@/lib/releases";

export type OsLabel = { os: DetectedDevice | null; labelKey: string; href: string };

const LABELS: Record<DetectedDevice, { labelKey: string; href: string }> = {
  macos: { labelKey: "osMac", href: "/download?os=mac" },
  windows: { labelKey: "osWindows", href: "/download?os=windows" },
  linux: { labelKey: "osLinux", href: "/download?os=linux" },
  android: { labelKey: "osAndroid", href: "/download?os=android" },
  ios: { labelKey: "osIos", href: "/register" },
};

const FALLBACK: OsLabel = { os: null, labelKey: "osFallback", href: "/download" };

/** The OS download button's label and link, resolved after mount so SSR and hydration agree. */
export function useOsLabel(): OsLabel {
  const [value, setValue] = useState<OsLabel>(FALLBACK);
  useEffect(() => {
    const os = detectDevice();
    if (os) setValue({ os, ...LABELS[os] });
  }, []);
  return value;
}
