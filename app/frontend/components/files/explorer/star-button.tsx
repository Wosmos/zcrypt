"use client";

import { useTranslations } from "next-intl";
import { Star } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useIsStarred, useStarredStore } from "@/store/starred";
import { FOCUS_RING } from "./types";

interface StarButtonProps {
  fileId: string;
  name: string;
  className?: string;
}

export function StarButton({ fileId, name, className }: StarButtonProps) {
  const t = useTranslations("app.explorerItem");
  const starred = useIsStarred(fileId);
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-pressed={starred}
      aria-label={t(starred ? "unstarFile" : "starFile", { name })}
      title={t(starred ? "unstar" : "star")}
      onClick={(e) => {
        e.stopPropagation();
        useStarredStore.getState().toggle(fileId);
      }}
      onKeyDown={(e) => e.stopPropagation()}
      className={cn(
        "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg transition-all hover:bg-[var(--color-surface-2)]",
        FOCUS_RING,
        starred
          ? "text-amber-400 opacity-100 [&_path]:fill-amber-400"
          : "text-[var(--color-text-muted)] opacity-100 hover:text-amber-400 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100",
        className,
      )}
    >
      <Star className="h-4 w-4" />
    </button>
  );
}
