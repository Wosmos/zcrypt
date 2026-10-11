"use client";

import { useTranslations } from "next-intl";
import type { VaultCollection } from "@/store/vault-view";
import { ChevronRight, Clock, Home, Star } from "@/lib/icons";
import { FOCUS_RING } from "./types";
import { cn } from "@/lib/utils";

interface CollectionBarProps {
  collection: VaultCollection;
  onExit?: () => void;
}

export function CollectionBar({ collection, onExit }: CollectionBarProps) {
  const t = useTranslations("explorer.collection");
  const Icon = collection === "starred" ? Star : Clock;
  return (
    <nav aria-label={t("path")} className="flex min-w-0 flex-1 items-center gap-0.5">
      <button
        type="button"
        onClick={onExit}
        className={cn(
          "flex flex-shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)]",
          FOCUS_RING,
        )}
      >
        <Home className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">{t("backToVault")}</span>
      </button>
      <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[var(--color-text-muted)] rtl:-scale-x-100" />
      <span
        aria-current="page"
        className="flex items-center gap-1.5 whitespace-nowrap px-2 py-1 text-sm font-medium text-[var(--color-text)]"
      >
        <Icon className="h-3.5 w-3.5 text-[var(--color-accent)]" />
        {t(`${collection}.title`)}
      </span>
    </nav>
  );
}
