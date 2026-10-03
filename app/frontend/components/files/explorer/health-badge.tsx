"use client";

import { useState } from "react";
import { retryFileSync } from "@/lib/api";
import { invalidateFilesViews } from "@/lib/invalidate";
import { AlertTriangle, RefreshCw } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { toast } from "@/store/toast";
import type { FileMetadata } from "@/types";
import { FOCUS_RING } from "./types";

const PILL =
  "inline-flex flex-shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none";

/**
 * Durability warning next to a file's name. "damaged" means a chunk is confirmed
 * missing on the storage platform, so the file has to be uploaded again;
 * "degraded" means a chunk never made it to the platform after every automatic
 * retry, and tapping the pill queues it again.
 */
export function FileHealthBadge({ file }: { file: FileMetadata }) {
  const [retrying, setRetrying] = useState(false);

  if (file.health === "damaged") {
    return (
      <span
        className={cn(PILL, "bg-red-500/10 text-red-500")}
        title="Part of this file is missing from storage. Upload it again from your original copy."
      >
        <AlertTriangle className="h-3 w-3" strokeWidth={2.25} />
        Damaged
      </span>
    );
  }

  if (file.health !== "degraded") return null;

  const retry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRetrying(true);
    try {
      await retryFileSync(file.id);
      toast.success("Retrying the backup of this file");
      await invalidateFilesViews();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not retry the backup");
    } finally {
      setRetrying(false);
    }
  };

  return (
    <button
      type="button"
      onClick={retry}
      disabled={retrying}
      className={cn(PILL, "bg-amber-500/10 text-amber-600 hover:bg-amber-500/20", FOCUS_RING)}
      title="This file hasn't reached your storage yet. Tap to retry."
    >
      <RefreshCw className={cn("h-3 w-3", retrying && "animate-spin")} strokeWidth={2.25} />
      Not backed up
    </button>
  );
}
