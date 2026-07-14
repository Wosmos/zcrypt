"use client";

import { useEffect, useState, type ComponentType } from "react";
import type { ExplorerItemProps, FolderItemProps, FileItemProps } from "./types";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./types";
import { CheckSquare, Square } from "@/lib/icons";
import type { FileMetadata } from "@/types";
import { deriveNameKey, decryptNameSafe } from "@/lib/name-crypto";
import { useAuthStore } from "@/store/auth";
import { usePassphraseStore } from "@/store/passphrase";

// Cache the derived per-user name key across every card/row the explorer
// renders, so a grid of many files doesn't re-run PBKDF2 (deriveNameKey) once
// per tile — mirrors useFolders' nameKeyRef, just module-scoped since this is
// called from one hook instance per file.
let nameKeyCache: { passphrase: string; userId: string; key: Promise<CryptoKey> } | null = null;

function getNameKeyCached(passphrase: string, userId: string): Promise<CryptoKey> {
  if (nameKeyCache && nameKeyCache.passphrase === passphrase && nameKeyCache.userId === userId) {
    return nameKeyCache.key;
  }
  const key = deriveNameKey(passphrase, userId);
  nameKeyCache = { passphrase, userId, key };
  return key;
}

/**
 * Defensive fallback name resolver for the explorer's file card/row.
 *
 * Every file normally arrives with `original_name` already resolved by the
 * query source (lib/file-names.ts's `decryptFileNames`, run once per fetch —
 * see store/files.ts) — the SAME per-user name key (lib/name-crypto, keyed off
 * the vault passphrase) used everywhere else names are decrypted. This hook
 * exists only for the case a `FileMetadata` reaches the explorer with that
 * resolve not yet applied (`original_name` empty but `encrypted_name`
 * present — e.g. an entry built ahead of the next refetch): it re-derives that
 * same key and decrypts `encrypted_name` directly, so a folder's contents
 * never fall through to showing the raw file id while a real name is
 * decryptable.
 *
 * Resolution order: an already-resolved `original_name` → a freshly decrypted
 * name → "[locked]" (encrypted but the vault isn't unlocked yet, or the
 * decrypt is still in flight) → the file id (truly nothing else to show — no
 * `encrypted_name` AND no `original_name`, which should only happen for a
 * malformed legacy row).
 */
export function useExplorerFileName(file: FileMetadata): string {
  const userId = useAuthStore((s) => s.user?.id);
  // Subscribe to the raw cached passphrase (a reactive VALUE) so this hook
  // re-decrypts the moment the vault unlocks, mirroring useFolders.
  const passphrase = usePassphraseStore((s) => s.cachedPassphrase);
  const encryptedName = file.encrypted_name;
  const needsDecrypt = !file.original_name && !!encryptedName;
  const [decrypted, setDecrypted] = useState<string | null>(null);

  useEffect(() => {
    if (!needsDecrypt || !userId || !passphrase) {
      setDecrypted(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const key = await getNameKeyCached(passphrase, userId);
      const name = await decryptNameSafe(encryptedName as string, key);
      if (!cancelled) setDecrypted(name);
    })();
    return () => {
      cancelled = true;
    };
  }, [needsDecrypt, encryptedName, userId, passphrase]);

  if (file.original_name) return file.original_name;
  if (decrypted) return decrypted;
  if (encryptedName) return "[locked]";
  return file.id;
}

/**
 * File selection-mode toggle button — shared by ExplorerCard and ExplorerRow.
 * `className` carries the only real difference between the two: absolute
 * positioning over the card thumbnail vs. an inline flex slot in the row.
 * `displayName` is the caller's already-resolved name (see
 * `useExplorerFileName`) — passed in rather than re-resolved here so a
 * select-mode grid doesn't run a second decrypt per tile.
 */
export function SelectCheckbox({
  file,
  displayName,
  selected,
  onSelect,
  className,
}: {
  file: FileMetadata;
  displayName: string;
  selected: boolean;
  onSelect: (id: string) => void;
  className: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(file.id);
      }}
      className={cn(className, FOCUS_RING)}
      aria-label={selected ? `Deselect ${displayName}` : `Select ${displayName}`}
      aria-pressed={selected}
    >
      {selected ? (
        <CheckSquare className="h-4 w-4 text-[var(--color-accent)]" />
      ) : (
        <Square className="h-4 w-4 text-[var(--color-text-muted)]" />
      )}
    </button>
  );
}

interface ExplorerEntryDispatchProps extends ExplorerItemProps {
  FolderView: ComponentType<FolderItemProps>;
  FileView: ComponentType<FileItemProps>;
}

/**
 * Resolves an ExplorerEntry to its folder or file renderer, forwarding the
 * matching prop subset. Shared by ExplorerCardImpl and ExplorerRowImpl — the
 * list/grid dispatch differs only in which pair of leaf components it passes in.
 */
export function ExplorerEntryDispatch({
  FolderView,
  FileView,
  entry,
  actions,
  selectMode,
  selected,
  focused,
  onSelect,
  onRequestSelect,
  onFileClick,
  onEntryKeyDown,
  onOpenFolder,
  onRenameFolder,
  onDeleteFolder,
  onProtectFolder,
  onRemoveFolderPassword,
  onMoveFolderRequest,
  onOpenFolderDetails,
  onShareFolder,
  onCustomizeFolder,
  onOpenDetails,
  onCustomizeFile,
  drag,
}: ExplorerEntryDispatchProps) {
  if (entry.kind === "folder") {
    return (
      <FolderView
        entry={entry}
        folder={entry.folder}
        focused={focused}
        onOpenFolder={onOpenFolder}
        onEntryKeyDown={onEntryKeyDown}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onProtectFolder={onProtectFolder}
        onRemoveFolderPassword={onRemoveFolderPassword}
        onMoveFolderRequest={onMoveFolderRequest}
        onOpenFolderDetails={onOpenFolderDetails}
        onShareFolder={onShareFolder}
        onCustomizeFolder={onCustomizeFolder}
        drag={drag}
      />
    );
  }
  return (
    <FileView
      entry={entry}
      file={entry.file}
      actions={actions}
      selectMode={selectMode}
      selected={selected}
      focused={focused}
      onSelect={onSelect}
      onRequestSelect={onRequestSelect}
      onFileClick={onFileClick}
      onEntryKeyDown={onEntryKeyDown}
      onOpenDetails={onOpenDetails ?? actions.onOpenDetails}
      onCustomizeFile={onCustomizeFile}
      drag={drag}
    />
  );
}
