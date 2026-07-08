import type { FileMetadata } from "@/types";
import type { DecryptedFolder } from "@/hooks/useFolders";

export type SortField = "name" | "size" | "date" | "saved" | "type";
export type SortDir = "asc" | "desc";
export type ViewMode = "list" | "grid";
/** Grid density: "auto" = responsive (2/3/4 by width), or a user-locked column count. */
export type GridCols = "auto" | 1 | 2 | 4 | 6 | 8 | 10 | 12;

/**
 * A unified entry in the explorer listing. Folders and files coexist under one
 * breadcrumb; `kind` discriminates which payload is present. The explorer sorts
 * folders first (always by name) then files (by the chosen sort field).
 */
export type ExplorerEntry =
  | { kind: "folder"; folder: DecryptedFolder }
  | { kind: "file"; file: FileMetadata };

/** Callbacks the explorer forwards to the page's crypto/upload context. */
export interface ExplorerActions {
  onPreview?: (filename: string) => void;
  onDownload: (filename: string) => void;
  onShare?: (id: string) => void;
  onOpenDetails?: (file: FileMetadata) => void;
  onDelete: (id: string) => void;
  /** Move a file into a folder (null = Root). Page does optimistic reconcile. */
  onMoveFile?: (fileId: string, folderId: string | null) => void;
  /** Open the page's "Move to folder" dialog for a file. */
  onMoveRequest?: (fileId: string) => void;
}

/**
 * Shared `React.memo` comparator for ExplorerRow / ExplorerCard.
 *
 * These rows/cards are rendered from a `.map()` in vault-explorer with inline
 * callback props (`onOpenFolder`, `startRename`, …) and a freshly-built `drag`
 * object per entry per render. Those callbacks are recreated every parent
 * render but are behaviourally stable, so comparing their identity would defeat
 * memoization entirely. Instead we compare only the props that actually change
 * what a row renders: the entry payload, selection / focus / select-mode flags,
 * the `actions` bag identity (stable per parent render), and the *visual* drag
 * fields (`draggable`, `isBeingDragged`, `isDropOver`) — the drag handler
 * closures are ignored for the same reason as the other callbacks.
 *
 * The one callback we *cannot* ignore is `onRequestSelect`: unlike the other
 * callbacks it is not always defined — it toggles between a function and
 * `undefined` based on `isMobile`, and its *presence* gates whether the mobile
 * "Select" menu item renders. So we compare it by presence (`!!prev === !!next`)
 * — enough to catch the mobile-breakpoint flip without keying off the unstable
 * closure identity.
 *
 * The entry is compared by reference first (the explorer memoizes its sorted
 * list, so unchanged entries keep their identity), then by a shallow content
 * check as a fallback for any callers that rebuild entry objects.
 */
interface ExplorerItemLikeProps {
  entry: ExplorerEntry;
  actions: ExplorerActions;
  selectMode: boolean;
  selected: boolean;
  focused: boolean;
  /** Presence (defined vs undefined) gates the mobile "Select" menu item. */
  onRequestSelect?: (fileId: string) => void;
  drag: {
    draggable: boolean;
    isBeingDragged?: boolean;
    isDropOver?: boolean;
  };
}

function entriesEqual(a: ExplorerEntry, b: ExplorerEntry): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  if (a.kind === "folder" && b.kind === "folder") return a.folder === b.folder;
  if (a.kind === "file" && b.kind === "file") return a.file === b.file;
  return false;
}

export function explorerItemPropsEqual(
  prev: ExplorerItemLikeProps,
  next: ExplorerItemLikeProps
): boolean {
  return (
    prev.selectMode === next.selectMode &&
    prev.selected === next.selected &&
    prev.focused === next.focused &&
    prev.actions === next.actions &&
    Boolean(prev.onRequestSelect) === Boolean(next.onRequestSelect) &&
    prev.drag.draggable === next.drag.draggable &&
    prev.drag.isBeingDragged === next.drag.isBeingDragged &&
    prev.drag.isDropOver === next.drag.isDropOver &&
    entriesEqual(prev.entry, next.entry)
  );
}
