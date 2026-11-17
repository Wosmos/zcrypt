"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { takeInterrupted, watchPageExit } from "@/lib/interrupted-downloads";
import { isTauri } from "@/lib/tauri";
import { useDownloadStore } from "@/store/download";
import { toast } from "@/store/toast";
import { DownloadStatus } from "@/types";

const SHOWN = 3;
const RUNNING: DownloadStatus[] = [
  DownloadStatus.Queued,
  DownloadStatus.Downloading,
  DownloadStatus.Paused,
];

/**
 * A web download lives in this tab's memory (or in an open disk file the tab
 * owns), so a reload or close ends it. After a reload, say so plainly instead of
 * letting the transfer list look as if nothing happened.
 */
export function useInterruptedDownloads() {
  const t = useTranslations("app.toasts");
  useEffect(() => {
    if (isTauri) return;
    const names = takeInterrupted();
    if (names.length > 0) {
      const shown = names.slice(0, SHOWN).join(", ");
      const rest = names.length - SHOWN;
      toast.warning(
        t("downloadInterrupted", {
          names: rest > 0 ? `${shown} ${t("andMore", { count: rest })}` : shown,
        }),
      );
    }
    return watchPageExit(() =>
      useDownloadStore
        .getState()
        .queue.filter((i) => RUNNING.includes(i.status))
        .map((i) => i.filename),
    );
  }, [t]);
}
