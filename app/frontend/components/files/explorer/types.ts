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
