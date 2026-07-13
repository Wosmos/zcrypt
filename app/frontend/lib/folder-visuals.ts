import { getFolderIcon, getFolderInitial, getIconByKey } from "@/lib/folder-icons";
import { getBackgroundByKey } from "@/lib/background-presets";
import type { DecryptedFolder } from "@/hooks/useFolders";

export interface FolderVisuals {
  isLocked: boolean;
  /** Phosphor glyph for the folder face, or null when locked. */
  FolderGlyph: ReturnType<typeof getFolderIcon> | null;
  /** First letter fallback (macOS special-folder style); "" when locked. */
  initial: string;
  /** Resolved custom-background CSS, or undefined for none. */
  customBackground: string | undefined;
  /** Custom accent color, or undefined for none. */
  customColor: string | undefined;
}

/**
 * Resolve a folder's card visuals — lock state, glyph, initial letter, and any
 * custom background/color — in ONE place, shared by the grid card and the list
 * row so the two renderers can never drift (and so jscpd sees no copy-paste).
 */
export function folderVisuals(folder: DecryptedFolder): FolderVisuals {
  const isLocked = folder.protected || folder.name === "[locked]";
  const customIcon = !isLocked && folder.style?.icon ? getIconByKey(folder.style.icon) : null;
  const FolderGlyph = isLocked ? null : (customIcon ?? getFolderIcon(folder.name));
  const initial = isLocked ? "" : getFolderInitial(folder.name);
  const customBackground =
    !isLocked && folder.style?.background ? (getBackgroundByKey(folder.style.background) ?? undefined) : undefined;
  const customColor = !isLocked ? folder.style?.color : undefined;
  return { isLocked, FolderGlyph, initial, customBackground, customColor };
}
