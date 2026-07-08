"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Link2, Copy, Check, Lock, Loader2, Trash2, FolderOpen } from "@/lib/icons";
import { listFolderShares, revokeFolderShare, type FolderShareLink } from "@/lib/api";
import { createFolderShareLink } from "@/lib/folder-share";
import { copyToClipboard } from "@/lib/clipboard";
import { collectSubtreeFolderIds } from "@/lib/folder-tree";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { formatDate } from "@/lib/utils";
import { toast } from "@/store/toast";
import type { DecryptedFolder } from "@/hooks/useFolders";
import type { FileMetadata } from "@/types";

const EXPIRY_OPTIONS = [
  { label: "Never", value: 0 },
  { label: "1 hour", value: 1 },
  { label: "24 hours", value: 24 },
  { label: "7 days", value: 168 },
  { label: "30 days", value: 720 },
];
const DOWNLOAD_LIMIT_OPTIONS = [
  { label: "Unlimited", value: 0 },
  { label: "10", value: 10 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
];

interface FolderShareModalProps {
  folder: DecryptedFolder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The full vault file list — the folder's subtree files are selected from it. */
  files: FileMetadata[];
}

export function FolderShareModal({ folder, open, onOpenChange, files }: FolderShareModalProps) {
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [expiryHours, setExpiryHours] = useState(0);
  const [maxDownloads, setMaxDownloads] = useState(0);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Which files fall under this folder (recursively). Computed on open.
  const [subtreeIds, setSubtreeIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!open || !folder) {
      setSubtreeIds(null);
      return;
    }
    // Reset the form each open.
    setUsePassword(false);
    setPassword("");
    setExpiryHours(0);
    setMaxDownloads(0);
    setError("");
    setLink(null);
    setCopied(false);

    let cancelled = false;
    collectSubtreeFolderIds(folder.id).then((ids) => {
      if (!cancelled) setSubtreeIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [open, folder]);

  const folderFiles = useMemo(
    () => (subtreeIds ? files.filter((f) => f.folder_id && subtreeIds.has(f.folder_id)) : []),
    [subtreeIds, files]
  );

  const linksQuery = useQuery({
    queryKey: qk.folderShares(folder?.id ?? ""),
    queryFn: () => listFolderShares(folder!.id),
    enabled: open && !!folder,
  });
  const existing = (linksQuery.data ?? []).filter((l) => !l.revoked);

  const handleGenerate = async () => {
    if (!folder) return;
    setError("");
    setCreating(true);
    try {
      const { url, shared, skipped, nestingIncomplete } = await createFolderShareLink(
        folder.id,
        folder.name,
        folderFiles,
        {
          password: usePassword ? password : undefined,
          expiresHours: expiryHours || undefined,
          maxDownloads: maxDownloads || undefined,
        }
      );
      setLink(url);
      if (nestingIncomplete) {
        toast.error(
          "Link created, but the folder layout couldn't be read — its download will be flat. Recreate the link to include the folder structure."
        );
      } else {
        toast.success(
          skipped > 0
            ? `Folder link created — ${shared} file${shared === 1 ? "" : "s"} shared, ${skipped} skipped`
            : `Folder link created — ${shared} file${shared === 1 ? "" : "s"}`
        );
      }
      void queryClient.invalidateQueries({ queryKey: qk.folderShares(folder.id) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create folder link");
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async (value: string) => {
    if (await copyToClipboard(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy");
    }
  };

  const handleRevoke = async (id: string) => {
    if (!folder) return;
    try {
      await revokeFolderShare(id);
      void queryClient.invalidateQueries({ queryKey: qk.folderShares(folder.id) });
      toast.success("Folder link revoked");
    } catch {
      toast.error("Failed to revoke");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !creating && onOpenChange(o)}>
      <DialogContent className="max-w-lg overflow-hidden border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-[var(--color-accent)]" />
            <span className="truncate">Share “{folder?.name}”</span>
          </DialogTitle>
          <DialogDescription className="text-[var(--color-text-secondary)]">
            Create a public link to this folder. Anyone with the link can open and
            download its files — the decryption key stays in the link and never
            reaches the server.
          </DialogDescription>
        </DialogHeader>

        {link ? (
          <div className="min-w-0 space-y-3">
            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2">
              <Link2 className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
              <input
                readOnly
                value={link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 select-all truncate bg-transparent font-mono text-xs text-[var(--color-text)] outline-none"
              />
              <IconButton
                icon={copied ? Check : Copy}
                label="Copy link"
                variant="ghost"
                onClick={() => handleCopy(link)}
                className="h-7 w-7 flex-shrink-0"
                iconClassName="h-3.5 w-3.5"
              />
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              Keep the whole link — the part after <span className="font-mono">#</span> is the
              decryption key and is required to open the folder.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              {subtreeIds === null
                ? "Scanning folder…"
                : `${folderFiles.length} file${folderFiles.length === 1 ? "" : "s"} will be shared (including sub-folders).`}
            </p>

            <label className="flex items-center gap-2.5 text-sm text-[var(--color-text)]">
              <Checkbox
                checked={usePassword}
                onCheckedChange={(checked) => setUsePassword(checked === true)}
              />
              <Lock className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              Require a password
            </label>
            {usePassword && (
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Link password"
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--color-text-muted)]">Expires</label>
                <Select value={String(expiryHours)} onValueChange={(v) => setExpiryHours(Number(v))}>
                  <SelectTrigger className="h-10 rounded-xl border-[var(--color-border)] bg-[var(--color-surface)] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
                    {EXPIRY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--color-text-muted)]">Max downloads</label>
                <Select value={String(maxDownloads)} onValueChange={(v) => setMaxDownloads(Number(v))}>
                  <SelectTrigger className="h-10 rounded-xl border-[var(--color-border)] bg-[var(--color-surface)] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
                    {DOWNLOAD_LIMIT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}

            {existing.length > 0 && (
              <div className="space-y-1 border-t border-[var(--color-border)] pt-3">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  Active links ({existing.length})
                </p>
                <ul className="space-y-1">
                  {existing.map((l: FolderShareLink) => (
                    <li key={l.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--color-surface-1)]">
                      <span className="min-w-0 truncate text-xs text-[var(--color-text-secondary)]">
                        {l.file_count} file{l.file_count === 1 ? "" : "s"}
                        {l.has_password && " · password"}
                        {" · "}
                        {formatDate(l.created_at)}
                      </span>
                      <IconButton
                        icon={Trash2}
                        label="Revoke link"
                        variant="ghost"
                        onClick={() => handleRevoke(l.id)}
                        className="h-7 w-7 flex-shrink-0 hover:text-red-500"
                        iconClassName="h-3.5 w-3.5"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {link ? (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={creating}>
                Cancel
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={creating || subtreeIds === null || folderFiles.length === 0 || (usePassword && !password)}
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                {creating ? "Creating…" : "Create link"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
