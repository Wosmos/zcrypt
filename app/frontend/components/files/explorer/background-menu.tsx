"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { ViewMode } from "./types";
import { Check, CheckSquare, FileUpload, FolderAdd, GridView, ListView } from "@/lib/icons";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

interface ExplorerBackgroundMenuProps {
  children: ReactNode;
  disabled?: boolean;
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
  onNewFolder?: () => void;
  onUpload?: () => void;
  onSelectAll?: () => void;
}

export function ExplorerBackgroundMenu({
  children,
  disabled,
  view,
  onViewChange,
  onNewFolder,
  onUpload,
  onSelectAll,
}: ExplorerBackgroundMenuProps) {
  const t = useTranslations("explorer");
  const ta = useTranslations("app.vaultExplorer");
  const hasCreate = Boolean(onNewFolder || onUpload);
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild disabled={disabled}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {onNewFolder && (
          <ContextMenuItem className="gap-2" onSelect={onNewFolder}>
            <FolderAdd className="h-4 w-4" /> {t("newFolder")}
          </ContextMenuItem>
        )}
        {onUpload && (
          <ContextMenuItem className="gap-2" onSelect={onUpload}>
            <FileUpload className="h-4 w-4" /> {t("uploadFiles")}
          </ContextMenuItem>
        )}
        {hasCreate && onSelectAll && <ContextMenuSeparator />}
        {onSelectAll && (
          <ContextMenuItem className="gap-2" onSelect={onSelectAll}>
            <CheckSquare className="h-4 w-4" /> {ta("selectAll")}
          </ContextMenuItem>
        )}
        {(hasCreate || onSelectAll) && <ContextMenuSeparator />}
        <ContextMenuItem className="gap-2" onSelect={() => onViewChange("grid")}>
          <GridView className="h-4 w-4" /> {t("gridView")}
          {view === "grid" && <Check className="ms-auto h-4 w-4 text-[var(--color-accent)]" />}
        </ContextMenuItem>
        <ContextMenuItem className="gap-2" onSelect={() => onViewChange("list")}>
          <ListView className="h-4 w-4" /> {t("listView")}
          {view === "list" && <Check className="ms-auto h-4 w-4 text-[var(--color-accent)]" />}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
