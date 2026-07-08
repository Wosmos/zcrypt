"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import {
  listSharedVaults,
  getSharedVault,
  removeSharedVaultMember,
  deleteSharedVault,
  listFolders,
} from "@/lib/api";
import {
  createSpace,
  loadSpaceKey,
  shareSpace,
  shareFileIntoSpace,
  unshareFileFromSpace,
  downloadSpaceFile,
  rotateSpaceKey,
} from "@/lib/spaces";
import { ensureUserKeypair } from "@/lib/keys";
import { deriveNameKey, decryptNameSafe } from "@/lib/name-crypto";
import { usePassphraseStore } from "@/store/passphrase";
import { useFilesQuery } from "@/store/files";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { formatBytes } from "@/lib/utils";
import type { SharedVault, SharedVaultDetail, FileMetadata } from "@/types";
import { useAuthStore } from "@/store/auth";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { SkeletonRow } from "@/components/ui/skeletons";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Users, FolderOpen, Download, File as FileIcon, Loader2, ShieldCheck } from "@/lib/icons";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Root-level folders that currently contain files, with decrypted names + a
 *  live file count — the pickable "share a whole folder" options. */
function useFolderOptions(files: FileMetadata[], enabled: boolean) {
  const user = useAuthStore((s) => s.user);
  const cachedPassphrase = usePassphraseStore((s) => s.cachedPassphrase);

  const rawQuery = useQuery({
    queryKey: qk.folders(null),
    queryFn: () => listFolders(null),
    enabled,
  });

  const [names, setNames] = useState<Record<string, string>>({});
  const raw = rawQuery.data;
  useEffect(() => {
    let cancelled = false;
    const pass = usePassphraseStore.getState().getPassphrase();
    if (!raw || !user || !pass) {
      setNames({});
      return;
    }
    (async () => {
      const key = await deriveNameKey(pass, user.id);
      if (cancelled) return;
      const entries = await Promise.all(
        raw.map(async (f) => [f.id, await decryptNameSafe(f.encrypted_name, key)] as const)
      );
      if (!cancelled) setNames(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [raw, user, cachedPassphrase]);

  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of files) {
      if (f.folder_id) counts.set(f.folder_id, (counts.get(f.folder_id) ?? 0) + 1);
    }
    return (raw ?? [])
      .filter((f) => (counts.get(f.id) ?? 0) > 0)
      .map((f) => ({ id: f.id, name: names[f.id] ?? "Folder", count: counts.get(f.id) ?? 0 }));
  }, [raw, names, files]);
}

export function SharedVaultsContent() {
  const user = useAuthStore((s) => s.user);

  // ── Server state (TanStack Query — cached, so re-opening a space is instant) ──
  const vaultsQuery = useQuery({ queryKey: qk.spaces, queryFn: listSharedVaults });
  const vaults = vaultsQuery.data ?? [];
  const loading = vaultsQuery.isPending;

  const { data: files = [] } = useFilesQuery();

  // The open space is identified by id; its detail is a cached query keyed by id.
  // Opening a space you viewed in the last 30s serves from cache with no refetch.
  const [openId, setOpenId] = useState<string | null>(null);
  const detailQuery = useQuery({
    queryKey: qk.space(openId ?? ""),
    queryFn: () => getSharedVault(openId as string),
    enabled: !!openId,
  });
  const detail: SharedVaultDetail | null = openId ? detailQuery.data ?? null : null;

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [sizeLimitGb, setSizeLimitGb] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("viewer");
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<SharedVault | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [rotating, setRotating] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [removingFile, setRemovingFile] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const [showAddFiles, setShowAddFiles] = useState(false);
  const [addFileIds, setAddFileIds] = useState<string[]>([]);
  const [addingFiles, setAddingFiles] = useState(false);

  const folderOptions = useFolderOptions(files, showCreate || showAddFiles);

  // Cache helpers so mutations update the ONE cache instead of a second copy.
  const patchDetail = (id: string, fn: (d: SharedVaultDetail) => SharedVaultDetail) =>
    queryClient.setQueryData<SharedVaultDetail>(qk.space(id), (d) => (d ? fn(d) : d));
  const refreshDetail = (id: string) =>
    queryClient.invalidateQueries({ queryKey: qk.space(id) });
  const refreshList = () => queryClient.invalidateQueries({ queryKey: qk.spaces });

  // Make sure this device's keypair is loaded so creating/sharing spaces can
  // seal keys. Uses the cached vault passphrase if the vault is unlocked.
  useEffect(() => {
    const passphrase = usePassphraseStore.getState().getPassphrase();
    if (passphrase) ensureUserKeypair(passphrase);
  }, []);

  const resetCreate = () => {
    setName("");
    setDescription("");
    setSelectedFiles([]);
    setSizeLimitGb("");
    setCreateError("");
  };

  /** Toggle every file that lives in `folderId` (within `pool`) in a selection. */
  const toggleFolderFiles = (
    folderId: string,
    pool: FileMetadata[],
    setSel: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    const ids = pool.filter((f) => f.folder_id === folderId).map((f) => f.id);
    if (ids.length === 0) return;
    setSel((prev) => {
      const allIn = ids.every((id) => prev.includes(id));
      return allIn
        ? prev.filter((id) => !ids.includes(id))
        : Array.from(new Set([...prev, ...ids]));
    });
  };

  const handleCreate = async () => {
    setCreateError("");
    if (!name.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreating(true);
    try {
      const gb = parseFloat(sizeLimitGb);
      const limitBytes =
        sizeLimitGb.trim() && gb > 0 ? Math.round(gb * 1024 * 1024 * 1024) : 0;
      const vault = await createSpace(name.trim(), description.trim(), [], limitBytes);
      // Re-wrap each selected file's CEK under the space key so members can
      // actually decrypt them. Best-effort per file.
      let added = 0;
      for (const fid of selectedFiles) {
        try {
          await shareFileIntoSpace(vault, fid);
          added++;
        } catch {
          /* skip files we can't re-wrap (e.g. protected-folder files) */
        }
      }
      vault.file_ids = selectedFiles.slice(0, added);
      // Prime the list cache with the new space and refresh from the server.
      queryClient.setQueryData<SharedVault[]>(qk.spaces, (prev) => [vault, ...(prev ?? [])]);
      void refreshList();
      setShowCreate(false);
      resetCreate();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  // Opening a space is now just selecting its id — the cached query serves the
  // detail instantly if it's warm, and refetches in the background if stale.
  const openDetail = (vaultId: string) => {
    setMemberError("");
    setMemberEmail("");
    setMemberRole("viewer");
    setFileError("");
    setShowAddFiles(false);
    setAddFileIds([]);
    setOpenId(vaultId);
  };

  const handleDownloadFile = async (fileId: string, wrappedCek: string) => {
    if (!detail) return;
    setFileError("");
    setDownloadingFile(fileId);
    try {
      await downloadSpaceFile(detail, fileId, wrappedCek);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloadingFile(null);
    }
  };

  const handleRemoveFile = async (fileId: string) => {
    if (!detail) return;
    const id = detail.id;
    setFileError("");
    setRemovingFile(fileId);
    try {
      await unshareFileFromSpace(id, fileId);
      // Optimistic: drop it from the cached detail + the list's file count.
      patchDetail(id, (d) => ({ ...d, files: d.files.filter((f) => f.file_id !== fileId) }));
      void refreshList();
    } catch {
      setFileError("Failed to remove file");
      void refreshDetail(id);
    } finally {
      setRemovingFile(null);
    }
  };

  const handleAddFiles = async () => {
    if (!detail || addFileIds.length === 0) return;
    const id = detail.id;
    setFileError("");
    setAddingFiles(true);
    try {
      let failures = 0;
      for (const fid of addFileIds) {
        try {
          await shareFileIntoSpace(detail, fid);
        } catch {
          failures++;
        }
      }
      // Refetch so the file list shows names/sizes joined server-side.
      await refreshDetail(id);
      void refreshList();
      setShowAddFiles(false);
      setAddFileIds([]);
      if (failures > 0) setFileError(`${failures} file(s) couldn't be shared.`);
    } catch {
      setFileError("Failed to add files");
    } finally {
      setAddingFiles(false);
    }
  };

  const handleAddMember = async () => {
    if (!detail || !memberEmail.trim()) return;
    const id = detail.id;
    setMemberError("");
    setAddingMember(true);
    try {
      const spaceKey = await loadSpaceKey(detail);
      if (!spaceKey) {
        setMemberError("This space has no key you can share (it predates encrypted sharing). Recreate it.");
        return;
      }
      const member = await shareSpace(
        id,
        spaceKey,
        memberEmail.trim(),
        memberRole as "viewer" | "editor" | "admin"
      );
      patchDetail(id, (d) => ({
        ...d,
        members: [...d.members.filter((m) => m.user_id !== member.user_id), member],
      }));
      // Refresh so the member's fingerprint (joined server-side) shows up.
      void refreshDetail(id);
      setMemberEmail("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setMemberError(
        /no user|not found|404|published key/i.test(msg)
          ? "That user hasn't set up sharing yet — they need to sign in and unlock their vault once."
          : "Failed to add member"
      );
    } finally {
      setAddingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!detail) return;
    const id = detail.id;
    setMemberError("");
    setRotating(true);
    try {
      await removeSharedVaultMember(id, userId);
      const remaining = detail.members.filter((m) => m.user_id !== userId);
      // True revocation: rotate the space key so any copy the removed member kept
      // becomes useless (every file gets re-wrapped under the new key).
      try {
        await rotateSpaceKey(detail, remaining, detail.files);
      } catch {
        setMemberError(
          "Member removed, but re-keying failed. Unlock this space and use Re-key to finish revoking access."
        );
      }
      patchDetail(id, (d) => ({ ...d, members: remaining }));
    } catch {
      setMemberError("Failed to remove member");
      void refreshDetail(id);
    } finally {
      setRotating(false);
    }
  };

  const handleRotate = async () => {
    if (!detail) return;
    const id = detail.id;
    setMemberError("");
    setRotating(true);
    try {
      await rotateSpaceKey(detail, detail.members, detail.files);
      await refreshDetail(id);
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Re-key failed");
    } finally {
      setRotating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSharedVault(deleteTarget.id);
      queryClient.setQueryData<SharedVault[]>(qk.spaces, (prev) =>
        (prev ?? []).filter((v) => v.id !== deleteTarget.id)
      );
      queryClient.removeQueries({ queryKey: qk.space(deleteTarget.id) });
      if (openId === deleteTarget.id) setOpenId(null);
      setDeleteTarget(null);
    } catch {
      /* ignore */
    } finally {
      setDeleting(false);
    }
  };

  const isOwner = (vault: SharedVault) => vault.owner_id === user?.id;

  const canEdit =
    !!detail &&
    (detail.owner_id === user?.id || detail.role === "admin" || detail.role === "editor");
  const availableFiles = detail
    ? files.filter((f) => !detail.files?.some((sf) => sf.file_id === f.id))
    : [];
  const usedBytes = detail
    ? detail.files?.reduce((sum, f) => sum + (f.size ?? 0), 0) ?? 0
    : 0;
  const limitBytes = detail?.size_limit_bytes ?? 0;
  const overLimit = limitBytes > 0 && usedBytes >= limitBytes;
  const isSpaceOwner = !!detail && detail.owner_id === user?.id;
  const detailLoading = !!openId && detailQuery.isPending;

  return (
    <Section
      title="Shared vaults"
      description="Collaborate on encrypted files with people you invite."
      actions={
        <Button
          onClick={() => {
            resetCreate();
            setShowCreate(true);
          }}
          size="sm"
        >
          <Plus className="h-3.5 w-3.5" />
          New vault
        </Button>
      }
    >
      {loading ? (
        <div className="panel divide-y divide-[var(--color-border)] px-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      ) : vaults.length === 0 ? (
        <div className="panel flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-surface-1)] text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]">
            <Users className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--color-text)]">
              No shared vaults yet
            </p>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Create one to start collaborating with others.
            </p>
          </div>
          <Button
            onClick={() => {
              resetCreate();
              setShowCreate(true);
            }}
            size="sm"
            variant="secondary"
          >
            <Plus className="h-3.5 w-3.5" />
            New vault
          </Button>
        </div>
      ) : (
        <ul className="panel divide-y divide-[var(--color-border)]">
          {vaults.map((vault) => (
            <li key={vault.id}>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="group flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--color-surface-1)]"
              >
                <button
                  type="button"
                  onClick={() => openDetail(vault.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-surface)] rounded-lg"
                >
                  {/* A space is people-first, not a folder — use the Users glyph. */}
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20">
                    <Users className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">
                      {vault.name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                      {vault.description && (
                        <span className="truncate">{vault.description}</span>
                      )}
                      <span className="tabular-nums">
                        {vault.file_ids?.length || 0} files
                      </span>
                      <span className="text-[var(--color-border-hover)]">·</span>
                      <span className="tabular-nums">
                        {formatDate(vault.created_at)}
                      </span>
                    </div>
                  </div>
                  {!isOwner(vault) && (
                    <Badge
                      variant="secondary"
                      className="flex-shrink-0 bg-[var(--color-surface-1)] capitalize text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]"
                    >
                      {vault.role || "member"}
                    </Badge>
                  )}
                </button>
                {isOwner(vault) && (
                  <IconButton
                    icon={Trash2}
                    label="Delete vault"
                    variant="ghost"
                    onClick={() => setDeleteTarget(vault)}
                    className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-500"
                  />
                )}
              </motion.div>
            </li>
          ))}
        </ul>
      )}

      {/* Create vault modal */}
      <Dialog
        open={showCreate}
        onOpenChange={(o) => {
          if (creating) return;
          setShowCreate(o);
          if (!o) resetCreate();
        }}
      >
        <DialogContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
          <DialogHeader>
            <DialogTitle>Create shared vault</DialogTitle>
            <DialogDescription className="text-[var(--color-text-secondary)]">
              Group files into a vault and invite people to collaborate. Files
              stay encrypted end-to-end.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              label="Vault name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Project Atlas"
              autoFocus
            />
            <Input
              label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
            />
            <Input
              label="Size limit (GB)"
              type="number"
              min="0"
              step="0.5"
              value={sizeLimitGb}
              onChange={(e) => setSizeLimitGb(e.target.value)}
              placeholder="Optional — leave blank for no limit"
            />

            {(folderOptions.length > 0 || files.length > 0) && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  Add files
                  <span className="ml-1 normal-case text-[var(--color-text-muted)]">
                    (optional)
                  </span>
                </p>
                <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
                  {folderOptions.map((folder) => {
                    const ids = files.filter((f) => f.folder_id === folder.id).map((f) => f.id);
                    const allIn = ids.length > 0 && ids.every((id) => selectedFiles.includes(id));
                    return (
                      <label
                        key={folder.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-1)]"
                      >
                        <Checkbox
                          checked={allIn}
                          onCheckedChange={() => toggleFolderFiles(folder.id, files, setSelectedFiles)}
                        />
                        <FolderOpen className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
                        <span className="truncate text-sm font-medium text-[var(--color-text)]">
                          {folder.name}
                        </span>
                        <span className="ml-auto flex-shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">
                          {folder.count} file{folder.count === 1 ? "" : "s"}
                        </span>
                      </label>
                    );
                  })}
                  {files.map((f) => (
                    <label
                      key={f.id}
                      className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-1)]"
                    >
                      <Checkbox
                        checked={selectedFiles.includes(f.id)}
                        onCheckedChange={() =>
                          setSelectedFiles((prev) =>
                            prev.includes(f.id)
                              ? prev.filter((id) => id !== f.id)
                              : [...prev, f.id]
                          )
                        }
                      />
                      <FileIcon className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                      <span className="truncate text-sm text-[var(--color-text)]">
                        {f.original_name}
                      </span>
                    </label>
                  ))}
                </div>
                {selectedFiles.length > 0 && (
                  <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
                    {selectedFiles.length} selected
                  </p>
                )}
              </div>
            )}

            {createError && (
              <p
                role="alert"
                className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
              >
                {createError}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setShowCreate(false);
                resetCreate();
              }}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? "Creating..." : "Create vault"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Vault detail modal */}
      <Dialog
        open={!!openId}
        onOpenChange={(o) => {
          if (!o) setOpenId(null);
        }}
      >
        <DialogContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
          <DialogHeader>
            <DialogTitle className="truncate">
              {detail?.name ?? "Vault"}
            </DialogTitle>
            <DialogDescription className="text-[var(--color-text-secondary)]">
              {detail?.description ||
                `${detail?.files?.length ?? detail?.file_ids?.length ?? 0} files · ${detail?.members?.length ?? 0} members`}
            </DialogDescription>
          </DialogHeader>

          {detailLoading && !detail ? (
            <div className="space-y-2 py-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {/* Files */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                    Files
                    <span className="ml-1 tabular-nums">
                      ({detail.files?.length || 0})
                    </span>
                  </p>
                  {canEdit && availableFiles.length > 0 && !overLimit && (
                    <button
                      type="button"
                      onClick={() => {
                        setFileError("");
                        setShowAddFiles((v) => !v);
                        setAddFileIds([]);
                      }}
                      className="text-xs font-medium text-[var(--color-accent)] outline-none hover:underline"
                    >
                      {showAddFiles ? "Cancel" : "Add files"}
                    </button>
                  )}
                </div>

                {limitBytes > 0 ? (
                  <div className="space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-1)] ring-1 ring-[var(--color-border)]">
                      <div
                        className={`h-full rounded-full transition-all ${overLimit ? "bg-red-500" : "bg-[var(--color-accent)]"}`}
                        style={{ width: `${Math.min(100, (usedBytes / limitBytes) * 100)}%` }}
                      />
                    </div>
                    <p className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                      {formatBytes(usedBytes)} of {formatBytes(limitBytes)} used
                      {overLimit && " — limit reached"}
                    </p>
                  </div>
                ) : (
                  usedBytes > 0 && (
                    <p className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                      {formatBytes(usedBytes)} · no limit
                    </p>
                  )
                )}

                {detail.files && detail.files.length > 0 ? (
                  <ul className="space-y-1">
                    {detail.files.map((f) => (
                      <li
                        key={f.file_id}
                        className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-1)]"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileIcon className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                          <span className="truncate text-sm text-[var(--color-text)]">
                            {f.name || f.file_id}
                          </span>
                          {typeof f.size === "number" && (
                            <span className="flex-shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">
                              {formatBytes(f.size)}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-0.5">
                          <IconButton
                            icon={downloadingFile === f.file_id ? Loader2 : Download}
                            label="Download"
                            variant="ghost"
                            onClick={() => handleDownloadFile(f.file_id, f.wrapped_cek)}
                            disabled={downloadingFile === f.file_id}
                            className="h-7 w-7"
                            iconClassName={
                              downloadingFile === f.file_id
                                ? "h-3.5 w-3.5 animate-spin"
                                : "h-3.5 w-3.5"
                            }
                          />
                          {canEdit && (
                            <IconButton
                              icon={Trash2}
                              label="Remove file"
                              variant="ghost"
                              onClick={() => handleRemoveFile(f.file_id)}
                              disabled={removingFile === f.file_id}
                              className="h-7 w-7 hover:text-red-500"
                              iconClassName="h-3.5 w-3.5"
                            />
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    No files shared yet.
                  </p>
                )}

                {fileError && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                    {fileError}
                  </p>
                )}

                {showAddFiles && canEdit && (
                  <div className="space-y-2">
                    <div className="max-h-48 space-y-0.5 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-1.5">
                      {folderOptions
                        .filter((folder) =>
                          availableFiles.some((f) => f.folder_id === folder.id)
                        )
                        .map((folder) => {
                          const ids = availableFiles
                            .filter((f) => f.folder_id === folder.id)
                            .map((f) => f.id);
                          const allIn = ids.length > 0 && ids.every((id) => addFileIds.includes(id));
                          return (
                            <label
                              key={folder.id}
                              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-1)]"
                            >
                              <Checkbox
                                checked={allIn}
                                onCheckedChange={() =>
                                  toggleFolderFiles(folder.id, availableFiles, setAddFileIds)
                                }
                              />
                              <FolderOpen className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
                              <span className="truncate text-sm font-medium text-[var(--color-text)]">
                                {folder.name}
                              </span>
                              <span className="ml-auto flex-shrink-0 text-xs tabular-nums text-[var(--color-text-muted)]">
                                {ids.length} file{ids.length === 1 ? "" : "s"}
                              </span>
                            </label>
                          );
                        })}
                      {availableFiles.map((f) => (
                        <label
                          key={f.id}
                          className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-1)]"
                        >
                          <Checkbox
                            checked={addFileIds.includes(f.id)}
                            onCheckedChange={() =>
                              setAddFileIds((prev) =>
                                prev.includes(f.id)
                                  ? prev.filter((id) => id !== f.id)
                                  : [...prev, f.id]
                              )
                            }
                          />
                          <FileIcon className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                          <span className="truncate text-sm text-[var(--color-text)]">
                            {f.original_name}
                          </span>
                        </label>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      onClick={handleAddFiles}
                      disabled={addingFiles || addFileIds.length === 0}
                    >
                      {addingFiles
                        ? "Adding..."
                        : `Add ${addFileIds.length || ""} file${addFileIds.length === 1 ? "" : "s"}`.trim()}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                    Members
                    <span className="ml-1 tabular-nums">
                      ({detail.members?.length || 0})
                    </span>
                  </p>
                  {isSpaceOwner && (
                    <button
                      type="button"
                      onClick={handleRotate}
                      disabled={rotating}
                      title="Generate a new space key and re-wrap every file under it. Use after removing someone, or periodically."
                      className="flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] outline-none hover:underline disabled:opacity-50"
                    >
                      {rotating && <Loader2 className="h-3 w-3 animate-spin" />}
                      {rotating ? "Re-keying..." : "Re-key"}
                    </button>
                  )}
                </div>
                {detail.members && detail.members.length > 0 ? (
                  <ul className="space-y-1">
                    {detail.members.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--color-surface-1)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm text-[var(--color-text)]">
                              {m.username || m.email}
                            </span>
                            <Badge
                              variant="secondary"
                              className="flex-shrink-0 bg-[var(--color-surface-1)] capitalize text-[var(--color-text-muted)] ring-1 ring-[var(--color-border)]"
                            >
                              {m.role}
                            </Badge>
                          </div>
                          {m.fingerprint ? (
                            <p
                              className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-[var(--color-text-muted)]"
                              title="Verify this matches the fingerprint in the member's own Encryption key settings. If it does, no one intercepted their key."
                            >
                              <ShieldCheck className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{m.fingerprint}</span>
                            </p>
                          ) : (
                            <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                              No encryption key yet
                            </p>
                          )}
                        </div>
                        {m.user_id !== user?.id &&
                          detail.owner_id === user?.id && (
                            <IconButton
                              icon={Trash2}
                              label="Remove member"
                              variant="ghost"
                              onClick={() => handleRemoveMember(m.user_id)}
                              disabled={rotating}
                              className="h-7 w-7 flex-shrink-0 hover:text-red-500"
                              iconClassName="h-3.5 w-3.5"
                            />
                          )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-[var(--color-text-muted)]">
                    No members yet.
                  </p>
                )}
                <p className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                  <ShieldCheck className="h-3 w-3 flex-shrink-0" />
                  Compare each fingerprint with the member out-of-band to rule out a key swap.
                </p>
              </div>

              {detail.owner_id === user?.id && (
                <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
                  <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                    Invite a member
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="email"
                      value={memberEmail}
                      onChange={(e) => setMemberEmail(e.target.value)}
                      placeholder="Email address"
                      className="h-10 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
                    />
                    <Select value={memberRole} onValueChange={setMemberRole}>
                      <SelectTrigger className="h-10 w-full rounded-xl border-[var(--color-border)] bg-[var(--color-surface)] text-sm sm:w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
                        <SelectItem value="viewer">Viewer</SelectItem>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      onClick={handleAddMember}
                      disabled={addingMember || !memberEmail.trim()}
                    >
                      {addingMember ? "Adding..." : "Add"}
                    </Button>
                  </div>
                  {memberError && (
                    <p
                      role="alert"
                      className="text-sm text-red-600 dark:text-red-400"
                    >
                      {memberError}
                    </p>
                  )}
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="secondary" onClick={() => setOpenId(null)}>
              Close
            </Button>
            {detail && detail.owner_id === user?.id && (
              <Button
                variant="danger"
                onClick={() => setDeleteTarget(detail)}
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete vault
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!deleting && !o) setDeleteTarget(null);
        }}
        destructive
        title="Delete shared vault?"
        description={
          <>
            This removes{" "}
            <span className="font-medium text-[var(--color-text)]">
              {deleteTarget?.name}
            </span>{" "}
            and revokes access for all members. The underlying files are not
            deleted.
          </>
        }
        confirmLabel="Delete vault"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </Section>
  );
}
