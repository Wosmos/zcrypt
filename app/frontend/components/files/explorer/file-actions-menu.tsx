"use client";

import { useTranslations } from "next-intl";
import type { FileItemProps } from "./types";
import { FOCUS_RING } from "./types";
import { cn } from "@/lib/utils";
import {
  FolderOpen,
  Eye,
  Info,
  Download,
  Share2,
  Trash2,
  Edit,
  MoreHorizontal,
  CheckSquare,
  PaintBrush,
} from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function MenuTrigger({ label, className }: { label: string; className?: string }) {
  return (
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[var(--color-text-muted)] opacity-100 transition-all hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)] focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:bg-[var(--color-surface-2)] data-[state=open]:opacity-100 sm:opacity-0 sm:group-hover:opacity-100",
          FOCUS_RING,
          className,
        )}
        aria-label={label}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </DropdownMenuTrigger>
  );
}

type FileActionsMenuProps = Pick<
  FileItemProps,
  "file" | "actions" | "onRequestSelect" | "onOpenDetails" | "onCustomizeFile" | "onRenameFile"
> & { displayName: string; triggerClassName?: string };

export function FileActionsMenu({
  file,
  displayName,
  actions,
  onRequestSelect,
  onOpenDetails,
  onCustomizeFile,
  onRenameFile,
  triggerClassName,
}: FileActionsMenuProps) {
  const t = useTranslations("app.explorerItem");
  return (
    <DropdownMenu>
      <MenuTrigger label={t("actionsFor", { name: displayName })} className={triggerClassName} />
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        {onRequestSelect && (
          <>
            <DropdownMenuItem onClick={() => onRequestSelect(file.id)}>
              <CheckSquare className="h-4 w-4" /> {t("select")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {actions.onPreview && (
          <DropdownMenuItem onClick={() => actions.onPreview?.(file.id)}>
            <Eye className="h-4 w-4" /> {t("preview")}
          </DropdownMenuItem>
        )}
        {onRenameFile && (
          <DropdownMenuItem onClick={() => onRenameFile(file)}>
            <Edit className="h-4 w-4" /> {t("rename")}
          </DropdownMenuItem>
        )}
        {onCustomizeFile && (
          <DropdownMenuItem onClick={() => onCustomizeFile(file)}>
            <PaintBrush className="h-4 w-4" /> {t("customize")}
          </DropdownMenuItem>
        )}
        {onOpenDetails && (
          <DropdownMenuItem onClick={() => onOpenDetails(file)}>
            <Info className="h-4 w-4" /> {t("getInfo")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => actions.onDownload(file.id)}>
          <Download className="h-4 w-4" /> {t("download")}
        </DropdownMenuItem>
        {actions.onShare && (
          <DropdownMenuItem onClick={() => actions.onShare?.(file.id)}>
            <Share2 className="h-4 w-4" /> {t("share")}
          </DropdownMenuItem>
        )}
        {actions.onMoveRequest && (
          <DropdownMenuItem onClick={() => actions.onMoveRequest?.(file.id)}>
            <FolderOpen className="h-4 w-4" /> {t("moveToFolder")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => actions.onDelete(file.id)}
          className="text-red-500 focus:bg-red-500/10 focus:text-red-500"
        >
          <Trash2 className="h-4 w-4" /> {t("delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
