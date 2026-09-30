import { getBackgroundByKey } from "@/lib/background-presets";
import { getFolderIcon, getFolderInitial, getIconByKey } from "@/lib/folder-icons";
import type { FolderItemProps } from "./types";

/**
 * How a folder is drawn in the grid and the list: padlock when protected or
 * undecryptable, else its custom icon, name-inferred glyph or initial, tinted
 * by its custom colour or painted with its design background.
 */
export function folderLook(folder: FolderItemProps["folder"]) {
  const isLocked = folder.protected || folder.name === "[locked]";
  const customIcon = folder.style?.icon ? getIconByKey(folder.style.icon) : null;
  const background =
    !isLocked && folder.style?.background
      ? (getBackgroundByKey(folder.style.background) ?? undefined)
      : undefined;
  return {
    isLocked,
    Glyph: isLocked ? null : (customIcon ?? getFolderIcon(folder.name)),
    initial: isLocked ? "" : getFolderInitial(folder.name),
    background,
    color: isLocked ? undefined : folder.style?.color,
  };
}
