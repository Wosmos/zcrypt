"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getSharedVault,
  removeSharedVaultMember,
  updateSharedVault,
  updateSharedVaultMemberRole,
} from "@/lib/api";
import {
  loadSpaceKey,
  shareSpace,
  shareFileIntoSpace,
  unshareFileFromSpace,
  downloadSpaceFile,
  rotateSpaceKey,
  decryptSpaceFileName,
  spacePerms,
  canManageMember,
  type SpaceRole,
} from "@/lib/spaces";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { formatBytes, midTrunc } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useFilesQuery } from "@/store/files";
import { toast } from "@/store/toast";
import type { SharedVault, SharedVaultDetail, SharedVaultFile, SharedVaultMember } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonRow } from "@/components/ui/skeletons";
import { SpaceFilePicker } from "@/components/share/space-file-picker";
import { MemberAvatar, RoleBadge, StorageMeter } from "@/components/share/space-ui";
import { useFolderOptions } from "@/components/share/use-folder-options";
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
import {
  Plus,
  Trash2,
  Users,
  Download,
  File as FileIcon,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Edit,
  Check,
  X,
  LogOut,
  Key,
} from "@/lib/icons";

const ROLE_HELP: Record<SpaceRole, string> = {
  viewer: "Can open and download files.",
  editor: "Viewer, plus adds and removes files.",
  admin: "Editor, plus manages members and renames the space.",
};

function SectionLabel({ children, count }: { children: string; count?: number }) {
  return (
    <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
      {children}
      {count !== undefined && <span className="ml-1 tabular-nums">({count})</span>}
    </p>
  );
}

interface Props {
  openId: string | null;
  onClose: () => void;
  onRequestDelete: (vault: SharedVault) => void;
}

export function SpaceDetailDialog({ openId, onClose, onRequestDelete }: Props) {
  const user = useAuthStore((s) => s.user);
  const { data: myFiles = [] } = useFilesQuery();

  const detailQuery = useQuery({
    queryKey: qk.space(openId ?? ""),
    queryFn: () => getSharedVault(openId as string),
    enabled: !!openId,
  });
  const detail: SharedVaultDetail | null = openId ? (detailQuery.data ?? null) : null;

  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<SpaceRole>("viewer");
  const [addingMember, setAddingMember] = useState(false);
  const [memberError, setMemberError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<{
    userId: string;
    label: string;
    self: boolean;
  } | null>(null);
  const [rotating, setRotating] = useState(false);
  const [roleBusy, setRoleBusy] = useState<string | null>(null);

  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [removingFile, setRemovingFile] = useState<string | null>(null);
  const [fileError, setFileError] = useState("");
  const [showAddFiles, setShowAddFiles] = useState(false);
  const [addFileIds, setAddFileIds] = useState<string[]>([]);
  const [addingFiles, setAddingFiles] = useState(false);

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    setMemberEmail("");
    setMemberRole("viewer");
    setMemberError("");
    setFileError("");
    setShowAddFiles(false);
    setAddFileIds([]);
    setRenaming(false);
  }, [openId]);

  const folderOptions = useFolderOptions(myFiles, showAddFiles);
  const folderNames = useMemo(
    () => Object.fromEntries(folderOptions.map((f) => [f.id, f.name] as const)),
    [folderOptions],
  );
  const fileNameById = useMemo(
    () => Object.fromEntries(myFiles.map((f) => [f.id, f.original_name] as const)),
    [myFiles],
  );

  const [spaceFileNames, setSpaceFileNames] = useState<Record<string, string>>({});
  const displayFileName = (f: SharedVaultFile) =>
    spaceFileNames[f.file_id] || f.name || fileNameById[f.file_id] || "Encrypted file";

  useEffect(() => {
    if (!detail) {
      setSpaceFileNames({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        (detail.files ?? []).map(
          async (f) =>
            [f.file_id, (await decryptSpaceFileName(detail, f.wrapped_name)) ?? ""] as const,
        ),
      );
      if (!cancelled) setSpaceFileNames(Object.fromEntries(entries.filter(([, n]) => n)));
    })();
    return () => {
      cancelled = true;
    };
  }, [detail]);

  const patchDetail = (id: string, fn: (d: SharedVaultDetail) => SharedVaultDetail) =>
    queryClient.setQueryData<SharedVaultDetail>(qk.space(id), (d) => (d ? fn(d) : d));
  const refreshDetail = (id: string) => queryClient.invalidateQueries({ queryKey: qk.space(id) });
  const refreshList = () => queryClient.invalidateQueries({ queryKey: qk.spaces });

  const perms = detail ? spacePerms(detail, user?.id) : null;
  const canEdit = !!perms?.editFiles;
  const canManage = !!perms?.manage;
  const canRotate = !!perms?.rotate;
  const needsRotation = !!detail?.needs_rotation;
  const availableFiles = detail
    ? myFiles.filter((f) => !detail.files?.some((sf) => sf.file_id === f.id))
    : [];
  const usedBytes = detail?.files?.reduce((sum, f) => sum + (f.size ?? 0), 0) ?? 0;
  const limitBytes = detail?.size_limit_bytes ?? 0;
  const overLimit = limitBytes > 0 && usedBytes >= limitBytes;
  const loading = !!openId && detailQuery.isPending && !detail;

  const rotate = async (d: SharedVaultDetail, members: SharedVaultMember[]) => {
    await rotateSpaceKey(d, members, d.files);
    patchDetail(d.id, (x) => ({ ...x, needs_rotation: false }));
    void refreshDetail(d.id);
    void refreshList();
  };

  const handleRotate = async () => {
    if (!detail || !canRotate) return;
    setMemberError("");
    setRotating(true);
    try {
      await rotate(detail, detail.members);
      toast.success("Space key rotated");
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Key rotation failed");
    } finally {
      setRotating(false);
    }
  };

  const handleDownloadFile = async (fileId: string, wrappedCek: string, filename: string) => {
    if (!detail) return;
    setFileError("");
    setDownloadingFile(fileId);
    try {
      await downloadSpaceFile(detail, fileId, wrappedCek, filename);
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
      if (needsRotation && canRotate) await rotate(detail, detail.members);
      let failures = 0;
      const total = addFileIds.length;
      for (const fid of addFileIds) {
        try {
          await shareFileIntoSpace(detail, fid, fileNameById[fid] ?? "");
        } catch {
          failures++;
        }
      }
      await refreshDetail(id);
      void refreshList();
      setShowAddFiles(false);
      setAddFileIds([]);
      if (failures > 0) {
        setFileError(
          `${failures} of ${total} file${total === 1 ? "" : "s"} couldn't be added: files in password-protected folders can't be shared into a space.`,
        );
      } else {
        toast.success(`Added ${total} file${total === 1 ? "" : "s"}`);
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Failed to add files");
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
        setMemberError(
          "This space has no key you can share (it predates encrypted sharing). Recreate it.",
        );
        return;
      }
      const member = await shareSpace(id, spaceKey, memberEmail.trim(), memberRole);
      patchDetail(id, (d) => ({
        ...d,
        members: [...d.members.filter((m) => m.user_id !== member.user_id), member],
      }));
      void refreshDetail(id);
      void refreshList();
      setMemberEmail("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setMemberError(
        /no user|not found|404|published key/i.test(msg)
          ? "That user hasn't set up sharing yet: they need to sign in and unlock their vault once."
          : /only the owner/i.test(msg)
            ? msg
            : "Failed to add member",
      );
    } finally {
      setAddingMember(false);
    }
  };

  const handleRoleChange = async (userId: string, role: SpaceRole) => {
    if (!detail) return;
    const id = detail.id;
    setMemberError("");
    setRoleBusy(userId);
    try {
      await updateSharedVaultMemberRole(id, userId, role);
      patchDetail(id, (d) => ({
        ...d,
        members: d.members.map((m) => (m.user_id === userId ? { ...m, role } : m)),
      }));
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Failed to change role");
      void refreshDetail(id);
    } finally {
      setRoleBusy(null);
    }
  };

  const handleRemoveMember = async (userId: string, self: boolean) => {
    if (!detail) return;
    const id = detail.id;
    setMemberError("");
    setRotating(true);
    try {
      await removeSharedVaultMember(id, userId);
      if (self) {
        queryClient.setQueryData<SharedVault[]>(qk.spaces, (prev) =>
          (prev ?? []).filter((v) => v.id !== id),
        );
        queryClient.removeQueries({ queryKey: qk.space(id) });
        void refreshList();
        onClose();
        toast.success("You left the space");
        return;
      }
      const remaining = detail.members.filter((m) => m.user_id !== userId);
      patchDetail(id, (d) => ({ ...d, members: remaining, needs_rotation: true }));
      if (!canRotate) {
        void refreshDetail(id);
        return;
      }
      try {
        await rotate(detail, remaining);
      } catch {
        setMemberError(
          "Member removed and blocked, but re-keying failed. Use Rotate key to finish revoking their old key.",
        );
        void refreshDetail(id);
      }
    } catch (err) {
      setMemberError(err instanceof Error ? err.message : "Failed to remove member");
      void refreshDetail(id);
    } finally {
      setRotating(false);
      setRemoveTarget(null);
    }
  };

  const saveName = async () => {
    if (!detail) return;
    const next = nameDraft.trim();
    if (!next || next === detail.name) {
      setRenaming(false);
      return;
    }
    setSavingName(true);
    try {
      await updateSharedVault(detail.id, { name: next });
      patchDetail(detail.id, (d) => ({ ...d, name: next }));
      void refreshList();
      setRenaming(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't rename the space");
    } finally {
      setSavingName(false);
    }
  };

  const inviteRoles: SpaceRole[] = perms?.owner
    ? ["viewer", "editor", "admin"]
    : ["viewer", "editor"];

  return (
    <>
      <Dialog open={!!openId} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-h-[88vh] overflow-x-hidden border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-text)] sm:max-w-2xl">
          <div className="space-y-6 p-5 sm:p-6">
            <DialogHeader className="space-y-3">
              {renaming && detail ? (
                <form
                  className="flex items-center gap-2 pr-8"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveName();
                  }}
                >
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    aria-label="Space name"
                    autoFocus
                    maxLength={80}
                  />
                  <IconButton
                    icon={savingName ? Loader2 : Check}
                    label="Save name"
                    type="submit"
                    variant="secondary"
                    disabled={savingName || !nameDraft.trim()}
                    iconClassName={savingName ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                  />
                  <IconButton
                    icon={X}
                    label="Cancel"
                    variant="ghost"
                    onClick={() => setRenaming(false)}
                  />
                </form>
              ) : (
                <div className="flex items-center gap-3 pr-8">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20">
                    <Users className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <DialogTitle className="truncate text-base">
                        {detail?.name ?? "Space"}
                      </DialogTitle>
                      {perms && <RoleBadge role={perms.label} />}
                      {canManage && detail && (
                        <IconButton
                          icon={Edit}
                          label="Rename space"
                          variant="ghost"
                          className="h-7 w-7"
                          iconClassName="h-3.5 w-3.5"
                          onClick={() => {
                            setNameDraft(detail.name);
                            setRenaming(true);
                          }}
                        />
                      )}
                    </div>
                    <DialogDescription className="mt-0.5 text-[var(--color-text-secondary)]">
                      {detail?.description ||
                        (detail
                          ? `${detail.files.length} file${detail.files.length === 1 ? "" : "s"} · ${detail.members.length} member${detail.members.length === 1 ? "" : "s"}`
                          : "Loading space")}
                    </DialogDescription>
                  </div>
                </div>
              )}
            </DialogHeader>

            {loading ? (
              <div className="space-y-3" aria-busy="true">
                <Skeleton className="h-3 w-1/4 rounded-md" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))}
              </div>
            ) : detail && perms ? (
              <>
                {needsRotation && (
                  <div
                    role="status"
                    className="flex flex-col gap-3 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 sm:flex-row sm:items-center"
                  >
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-600 dark:text-amber-400" />
                    <p className="flex-1 text-sm text-[var(--color-text)]">
                      A member was removed. They are already blocked, but the space key must be
                      rotated to lock out any copy they kept.
                      {!canRotate &&
                        " Ask the owner to rotate it; adding files is paused until then."}
                    </p>
                    {canRotate && (
                      <Button size="sm" onClick={handleRotate} disabled={rotating}>
                        {rotating ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Key className="h-3.5 w-3.5" />
                        )}
                        Rotate key
                      </Button>
                    )}
                  </div>
                )}

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <SectionLabel count={detail.files.length}>Files</SectionLabel>
                    {canEdit && availableFiles.length > 0 && !overLimit && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={needsRotation && !canRotate}
                        onClick={() => {
                          setFileError("");
                          setShowAddFiles((v) => !v);
                          setAddFileIds([]);
                        }}
                      >
                        {showAddFiles ? (
                          "Cancel"
                        ) : (
                          <>
                            <Plus className="h-3.5 w-3.5" />
                            Add files
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  <StorageMeter used={usedBytes} limit={limitBytes} />

                  {detail.files.length > 0 ? (
                    <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
                      {detail.files.map((f) => (
                        <li
                          key={f.file_id}
                          className="flex items-center justify-between gap-2 px-3 py-2 transition-colors hover:bg-[var(--color-surface-1)]"
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <FileIcon className="h-4 w-4 flex-shrink-0 text-[var(--color-text-muted)]" />
                            <span className="min-w-0 truncate text-sm text-[var(--color-text)]">
                              {midTrunc(displayFileName(f), 28, 8)}
                            </span>
                            {typeof f.size === "number" && (
                              <span className="hidden flex-shrink-0 text-xs tabular-nums text-[var(--color-text-muted)] sm:inline">
                                {formatBytes(f.size)}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-shrink-0 items-center gap-0.5">
                            <IconButton
                              icon={downloadingFile === f.file_id ? Loader2 : Download}
                              label="Download"
                              onClick={() =>
                                handleDownloadFile(f.file_id, f.wrapped_cek, displayFileName(f))
                              }
                              disabled={downloadingFile === f.file_id}
                              className="h-8 w-8"
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
                                onClick={() => handleRemoveFile(f.file_id)}
                                disabled={removingFile === f.file_id}
                                className="h-8 w-8 hover:text-red-500"
                                iconClassName="h-3.5 w-3.5"
                              />
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-[var(--color-border)] px-4 py-8 text-center">
                      <FileIcon className="h-5 w-5 text-[var(--color-text-muted)]" />
                      <p className="text-sm font-medium text-[var(--color-text)]">No files yet</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {canEdit
                          ? "Add files from your vault to share them here."
                          : "Editors and admins can add files."}
                      </p>
                    </div>
                  )}

                  {fileError && (
                    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                      {fileError}
                    </p>
                  )}

                  {showAddFiles && canEdit && (
                    <div className="space-y-2">
                      <SpaceFilePicker
                        files={availableFiles}
                        folderNames={folderNames}
                        selected={addFileIds}
                        onChange={setAddFileIds}
                        emptyLabel="Every file is already in this space."
                      />
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
                </section>

                <section className="space-y-3 border-t border-[var(--color-border)] pt-5">
                  <div className="flex items-center justify-between gap-2">
                    <SectionLabel count={detail.members.length}>Members</SectionLabel>
                    {canRotate && !needsRotation && (
                      <button
                        type="button"
                        onClick={handleRotate}
                        disabled={rotating}
                        title="Generate a new space key and re-wrap every file under it, so any old key a former member kept stops working."
                        className="flex items-center gap-1 text-xs font-medium text-[var(--color-accent)] outline-none hover:underline disabled:opacity-50"
                      >
                        {rotating && <Loader2 className="h-3 w-3 animate-spin" />}
                        {rotating ? "Rotating..." : "Rotate key"}
                      </button>
                    )}
                  </div>

                  <ul className="divide-y divide-[var(--color-border)] rounded-xl border border-[var(--color-border)]">
                    {detail.members.map((m) => {
                      const label = m.username || m.email || "Member";
                      const isSelf = m.user_id === user?.id;
                      const isOwnerRow = m.user_id === detail.owner_id;
                      const manageable = canManageMember(perms, detail, m);
                      const roles: SpaceRole[] = perms.owner
                        ? ["viewer", "editor", "admin"]
                        : ["viewer", "editor"];
                      return (
                        <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                          <MemberAvatar id={m.user_id} label={label} className="h-8 w-8 text-xs" />
                          <div className="min-w-0 flex-1">
                            <p className="flex items-center gap-1.5 truncate text-sm text-[var(--color-text)]">
                              <span className="truncate">{label}</span>
                              {isSelf && (
                                <span className="text-xs text-[var(--color-text-muted)]">
                                  (you)
                                </span>
                              )}
                            </p>
                            {m.fingerprint ? (
                              <p
                                className="flex items-center gap-1 font-mono text-[11px] text-[var(--color-text-muted)]"
                                title="Verify this matches the fingerprint in the member's own Encryption key settings. If it does, no one intercepted their key."
                              >
                                <ShieldCheck className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate">{m.fingerprint}</span>
                              </p>
                            ) : (
                              <p className="text-[11px] text-[var(--color-text-muted)]">
                                No encryption key yet
                              </p>
                            )}
                          </div>
                          {manageable ? (
                            <Select
                              value={m.role}
                              onValueChange={(v) =>
                                void handleRoleChange(m.user_id, v as SpaceRole)
                              }
                              disabled={roleBusy === m.user_id || rotating}
                            >
                              <SelectTrigger
                                aria-label={`Role for ${label}`}
                                className="h-8 w-[5.5rem] flex-shrink-0 rounded-lg border-[var(--color-border)] bg-[var(--color-surface)] text-xs capitalize"
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
                                {roles.map((r) => (
                                  <SelectItem key={r} value={r} className="capitalize">
                                    {r}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <RoleBadge
                              role={
                                isOwnerRow
                                  ? "Owner"
                                  : m.role === "admin"
                                    ? "Admin"
                                    : m.role === "editor"
                                      ? "Editor"
                                      : "Viewer"
                              }
                            />
                          )}
                          {manageable && !isSelf && (
                            <IconButton
                              icon={Trash2}
                              label="Remove member"
                              onClick={() =>
                                setRemoveTarget({ userId: m.user_id, label, self: false })
                              }
                              disabled={rotating}
                              className="h-8 w-8 flex-shrink-0 hover:text-red-500"
                              iconClassName="h-3.5 w-3.5"
                            />
                          )}
                          {isSelf && !perms.owner && (
                            <IconButton
                              icon={LogOut}
                              label="Leave space"
                              onClick={() =>
                                setRemoveTarget({ userId: m.user_id, label, self: true })
                              }
                              disabled={rotating}
                              className="h-8 w-8 flex-shrink-0 hover:text-red-500"
                              iconClassName="h-3.5 w-3.5"
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <p className="flex items-center gap-1 text-[11px] text-[var(--color-text-muted)]">
                    <ShieldCheck className="h-3 w-3 flex-shrink-0" />
                    Compare each fingerprint with the member out-of-band to rule out a key swap.
                  </p>

                  {memberError && (
                    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                      {memberError}
                    </p>
                  )}
                </section>

                {canManage && (
                  <section className="space-y-3 border-t border-[var(--color-border)] pt-5">
                    <SectionLabel>Invite a member</SectionLabel>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="email"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void handleAddMember()}
                        placeholder="Email address"
                        aria-label="Email address"
                        className="h-10 flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-sm text-[var(--color-text)] outline-none transition-all placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-accent)]/40 focus:ring-2 focus:ring-[var(--color-accent)]/10"
                      />
                      <Select
                        value={memberRole}
                        onValueChange={(v) => setMemberRole(v as SpaceRole)}
                      >
                        <SelectTrigger
                          aria-label="Role"
                          className="h-10 w-full rounded-xl border-[var(--color-border)] bg-[var(--color-surface)] text-sm capitalize sm:w-32"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
                          {inviteRoles.map((r) => (
                            <SelectItem key={r} value={r} className="capitalize">
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={handleAddMember}
                        disabled={addingMember || !memberEmail.trim()}
                      >
                        {addingMember ? "Adding..." : "Invite"}
                      </Button>
                    </div>
                    <p className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                      <span className="capitalize">{memberRole}</span>: {ROLE_HELP[memberRole]}
                      {!perms.owner && " Only the owner can grant admin."}
                    </p>
                  </section>
                )}
              </>
            ) : null}

            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="secondary" onClick={onClose}>
                Close
              </Button>
              {perms?.owner && detail && (
                <Button variant="danger" onClick={() => onRequestDelete(detail)}>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete space
                </Button>
              )}
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(o) => {
          if (!rotating && !o) setRemoveTarget(null);
        }}
        destructive
        title={removeTarget?.self ? "Leave this space?" : "Remove member and re-key the space?"}
        description={
          removeTarget?.self ? (
            <p>You will lose access to every file in this space. An admin can invite you again.</p>
          ) : (
            <div className="space-y-2">
              <p>
                <span className="font-medium text-[var(--color-text)]">{removeTarget?.label}</span>{" "}
                loses access to this space immediately.
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  The space key is rotated and every file is re-wrapped under the new key, so any
                  copy of the old key they kept becomes useless.
                </li>
                <li>Files stay in the space for the remaining members. Nothing is deleted.</li>
                <li>Re-keying touches every file, so it can take a moment for a large space.</li>
              </ul>
            </div>
          )
        }
        confirmLabel={removeTarget?.self ? "Leave space" : "Remove and re-key"}
        loading={rotating}
        onConfirm={() =>
          removeTarget && void handleRemoveMember(removeTarget.userId, removeTarget.self)
        }
      />
    </>
  );
}
