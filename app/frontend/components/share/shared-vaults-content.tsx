"use client";

import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSharedVaults, deleteSharedVault } from "@/lib/api";
import { createSpace, shareFileIntoSpace } from "@/lib/spaces";
import { ensureUserKeypair } from "@/lib/keys";
import { usePassphraseStore } from "@/store/passphrase";
import { useFilesQuery } from "@/store/files";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import type { SharedVault } from "@/types";
import { useAuthStore } from "@/store/auth";
import { toast } from "@/store/toast";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SpaceFilePicker } from "@/components/share/space-file-picker";
import { SpaceDetailDialog } from "@/components/share/space-detail";
import { SpaceCard, SpaceCardSkeleton } from "@/components/share/space-ui";
import { useFolderOptions } from "@/components/share/use-folder-options";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Users, Search } from "@/lib/icons";
import { useAutoTour } from "@/components/onboarding/tour-provider";

export function SharedVaultsContent() {
  const user = useAuthStore((s) => s.user);

  const vaultsQuery = useQuery({ queryKey: qk.spaces, queryFn: listSharedVaults });
  const vaults = useMemo(() => vaultsQuery.data ?? [], [vaultsQuery.data]);
  const loading = vaultsQuery.isPending;

  const { data: files = [] } = useFilesQuery();

  const [openId, setOpenId] = useState<string | null>(null);
  useAutoTour("spaces", !loading && !openId);

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [sizeLimitGb, setSizeLimitGb] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<SharedVault | null>(null);
  const [deleting, setDeleting] = useState(false);

  const folderOptions = useFolderOptions(files, showCreate);
  const folderNames = useMemo(
    () => Object.fromEntries(folderOptions.map((f) => [f.id, f.name] as const)),
    [folderOptions],
  );
  const fileNameById = useMemo(
    () => Object.fromEntries(files.map((f) => [f.id, f.original_name] as const)),
    [files],
  );

  const [listQuery, setListQuery] = useState("");
  const filteredVaults = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    if (!q) return vaults;
    return vaults.filter(
      (v) => v.name.toLowerCase().includes(q) || (v.description ?? "").toLowerCase().includes(q),
    );
  }, [vaults, listQuery]);

  const refreshList = () => queryClient.invalidateQueries({ queryKey: qk.spaces });

  useEffect(() => {
    const passphrase = usePassphraseStore.getState().getPassphrase();
    if (passphrase) void ensureUserKeypair(passphrase);
  }, []);

  const resetCreate = () => {
    setName("");
    setDescription("");
    setSelectedFiles([]);
    setSizeLimitGb("");
    setCreateError("");
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
      const limitBytes = sizeLimitGb.trim() && gb > 0 ? Math.round(gb * 1024 * 1024 * 1024) : 0;
      const vault = await createSpace(name.trim(), description.trim(), [], limitBytes);
      // Re-wrap each selected file's CEK under the space key so members can
      // actually decrypt them. Best-effort per file; track which actually landed.
      const succeeded: string[] = [];
      for (const fid of selectedFiles) {
        try {
          await shareFileIntoSpace(vault, fid, fileNameById[fid] ?? "");
          succeeded.push(fid);
        } catch {
          /* skip files we can't re-wrap (e.g. protected-folder files) */
        }
      }
      vault.file_ids = succeeded;
      // Prime the list cache with the new space and refresh from the server.
      queryClient.setQueryData<SharedVault[]>(qk.spaces, (prev) => [vault, ...(prev ?? [])]);
      void refreshList();
      setShowCreate(false);
      resetCreate();
      const skipped = selectedFiles.length - succeeded.length;
      toast.success(`Space “${vault.name}” created`);
      if (skipped > 0) {
        toast.warning(
          `${skipped} file${skipped === 1 ? "" : "s"} couldn't be added: files in password-protected folders can't be shared into a space.`,
        );
      }
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteSharedVault(deleteTarget.id);
      queryClient.setQueryData<SharedVault[]>(qk.spaces, (prev) =>
        (prev ?? []).filter((v) => v.id !== deleteTarget.id),
      );
      queryClient.removeQueries({ queryKey: qk.space(deleteTarget.id) });
      if (openId === deleteTarget.id) setOpenId(null);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the space");
    } finally {
      setDeleting(false);
    }
  };

  const openNew = () => {
    resetCreate();
    setShowCreate(true);
  };

  return (
    <Section
      title="Your spaces"
      description="Encrypted files you share with people you invite, end-to-end, zero-knowledge."
      actions={
        <Button onClick={openNew} size="sm" data-tour="space-new">
          <Plus className="h-3.5 w-3.5" />
          New space
        </Button>
      }
    >
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <SpaceCardSkeleton key={i} />
          ))}
        </div>
      ) : vaults.length === 0 ? (
        <div
          className="panel flex flex-col items-center justify-center gap-3 px-6 py-14 text-center"
          data-tour="space-list"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20">
            <Users className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium text-[var(--color-text)]">No spaces yet</p>
            <p className="mx-auto max-w-sm text-sm text-[var(--color-text-secondary)]">
              A space is a shared, end-to-end encrypted folder. Invite people, pick who can edit,
              and revoke access any time.
            </p>
          </div>
          <Button onClick={openNew} size="sm" variant="secondary">
            <Plus className="h-3.5 w-3.5" />
            Create your first space
          </Button>
        </div>
      ) : (
        <div className="space-y-4" data-tour="space-list">
          {vaults.length > 1 && (
            <Input
              icon={<Search className="h-4 w-4" />}
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Search spaces"
              aria-label="Search spaces"
            />
          )}
          {filteredVaults.length === 0 ? (
            <p className="panel px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">
              No spaces match “{listQuery.trim()}”.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredVaults.map((vault, i) => (
                <SpaceCard
                  key={vault.id}
                  vault={vault}
                  userId={user?.id}
                  index={i}
                  onOpen={() => setOpenId(vault.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create space modal */}
      <Dialog
        open={showCreate}
        onOpenChange={(o) => {
          if (creating) return;
          setShowCreate(o);
          if (!o) resetCreate();
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto overflow-x-hidden border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
          <DialogHeader>
            <DialogTitle>Create a space</DialogTitle>
            <DialogDescription className="text-[var(--color-text-secondary)]">
              Group files and invite people to collaborate. Files stay encrypted end-to-end, the
              server never sees the key.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <Input
              label="Space name"
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
              placeholder="Optional. Leave blank for no limit"
            />

            {files.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  Add files
                  <span className="ml-1 normal-case text-[var(--color-text-muted)]">
                    (optional)
                  </span>
                </p>
                <SpaceFilePicker
                  files={files}
                  folderNames={folderNames}
                  selected={selectedFiles}
                  onChange={setSelectedFiles}
                />
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
              {creating ? "Creating..." : "Create space"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SpaceDetailDialog
        openId={openId}
        onClose={() => setOpenId(null)}
        onRequestDelete={setDeleteTarget}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => {
          if (!deleting && !o) setDeleteTarget(null);
        }}
        destructive
        title="Delete space?"
        description={
          <>
            This deletes the space{" "}
            <span className="font-medium text-[var(--color-text)]">{deleteTarget?.name}</span> and
            revokes access for everyone you invited. Your original files are not deleted.
          </>
        }
        confirmLabel="Delete space"
        loading={deleting}
        onConfirm={handleDelete}
      />
    </Section>
  );
}
