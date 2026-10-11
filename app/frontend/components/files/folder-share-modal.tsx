"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { EXPIRY_KEYS } from "@/components/share/expiry-keys";
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
import { createFolderShareLink, warmFolderShareKeys } from "@/lib/folder-share";
import { copyToClipboard } from "@/lib/clipboard";
import { collectSubtreeFolderIds } from "@/lib/folder-tree";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { formatDate, midTrunc, EXPIRY_OPTIONS } from "@/lib/utils";
import { toast } from "@/store/toast";
import type { DecryptedFolder } from "@/hooks/useFolders";
import type { FileMetadata } from "@/types";

const DOWNLOAD_LIMIT_OPTIONS = [
  { value: 0 },
  { label: "10", value: 10 },
  { label: "50", value: 50 },
  { label: "100", value: 100 },
];

interface FolderShareModalProps {
  folder: DecryptedFolder | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The full vault file list: the folder's subtree files are selected from it. */
  files: FileMetadata[];
}

export function FolderShareModal({ folder, open, onOpenChange, files }: FolderShareModalProps) {
  const t = useTranslations("spaces.share");
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [expiryHours, setExpiryHours] = useState(0);
  const [maxDownloads, setMaxDownloads] = useState(0);
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Which files fall under this folder (recursively). Computed on open.
  const [subtreeIds, setSubtreeIds] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!open || !folder) {
      // oxlint-disable-next-line react/set-state-in-effect
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
    void collectSubtreeFolderIds(folder.id).then((ids) => {
      if (!cancelled) setSubtreeIds(ids);
    });
    return () => {
      cancelled = true;
    };
  }, [open, folder]);

  const folderFiles = useMemo(
    () => (subtreeIds ? files.filter((f) => f.folder_id && subtreeIds.has(f.folder_id)) : []),
    [subtreeIds, files],
  );

  useEffect(() => {
    if (open && folderFiles.length > 0) void warmFolderShareKeys(folderFiles);
  }, [open, folderFiles]);

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
    setProgress(null);
    try {
      const { url, shared, skipped, nestingIncomplete } = await createFolderShareLink(
        folder.id,
        folder.name,
        folderFiles,
        {
          password: usePassword ? password : undefined,
          expiresHours: expiryHours || undefined,
          maxDownloads: maxDownloads || undefined,
          onProgress: (done, total) => setProgress({ done, total }),
        },
      );
      setLink(url);
      if (nestingIncomplete) {
        toast.error(t("folder.nestingIncomplete"));
      } else {
        toast.success(
          skipped > 0
            ? t("folder.createdSkipped", { shared, skipped })
            : t("folder.created", { shared }),
        );
      }
      void queryClient.invalidateQueries({ queryKey: qk.folderShares(folder.id) });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("folder.createFailed"));
    } finally {
      setCreating(false);
      setProgress(null);
    }
  };

  const handleCopy = async (value: string) => {
    if (await copyToClipboard(value)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error(t("copyFailed"));
    }
  };

  const handleRevoke = async (id: string) => {
    if (!folder) return;
    try {
      await revokeFolderShare(id);
      void queryClient.invalidateQueries({ queryKey: qk.folderShares(folder.id) });
      toast.success(t("folder.revoked"));
    } catch {
      toast.error(t("revokeFailed"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !creating && onOpenChange(o)}>
      <DialogContent className="max-w-lg overflow-hidden border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-[var(--color-accent)]" />
            <span className="truncate">
              {t("folder.title", {
                name: folder?.name ? midTrunc(folder.name, 18, 8) : (folder?.name ?? ""),
              })}
            </span>
          </DialogTitle>
          <DialogDescription className="text-[var(--color-text-secondary)]">
            {t("folder.description")}
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
                label={t("folder.copyLink")}
                variant="ghost"
                onClick={() => handleCopy(link)}
                className="h-7 w-7 flex-shrink-0"
                iconClassName="h-3.5 w-3.5"
              />
            </div>
            <p className="text-xs text-[var(--color-text-muted)]">
              {t.rich("folder.keepLink", {
                code: (chunks) => <span className="font-mono">{chunks}</span>,
              })}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              {subtreeIds === null
                ? t("folder.scanning")
                : t("folder.willShare", { count: folderFiles.length })}
            </p>

            <label className="flex items-center gap-2.5 text-sm text-[var(--color-text)]">
              <Checkbox
                checked={usePassword}
                onCheckedChange={(checked) => setUsePassword(checked === true)}
              />
              <Lock className="h-3.5 w-3.5 text-[var(--color-text-muted)]" />
              {t("folder.requirePassword")}
            </label>
            {usePassword && (
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("folder.passwordPlaceholder")}
              />
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--color-text-muted)]">
                  {t("folder.expires")}
                </label>
                <Select
                  value={String(expiryHours)}
                  onValueChange={(v) => setExpiryHours(Number(v))}
                >
                  <SelectTrigger className="h-10 rounded-xl border-[var(--color-border)] bg-[var(--color-surface)] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
                    {EXPIRY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {t(`expiry.${EXPIRY_KEYS[o.value] ?? "never"}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-[var(--color-text-muted)]">
                  {t("folder.maxDownloads")}
                </label>
                <Select
                  value={String(maxDownloads)}
                  onValueChange={(v) => setMaxDownloads(Number(v))}
                >
                  <SelectTrigger className="h-10 rounded-xl border-[var(--color-border)] bg-[var(--color-surface)] text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)]">
                    {DOWNLOAD_LIMIT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.value === 0 ? t("unlimited") : o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400"
              >
                {error}
              </p>
            )}

            {existing.length > 0 && (
              <div className="space-y-1 border-t border-[var(--color-border)] pt-3">
                <p className="text-xs font-medium uppercase tracking-wider text-[var(--color-text-muted)]">
                  {t("folder.activeLinks", { count: existing.length })}
                </p>
                <ul className="space-y-1">
                  {existing.map((l: FolderShareLink) => (
                    <li
                      key={l.id}
                      className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--color-surface-1)]"
                    >
                      <span className="min-w-0 truncate text-xs text-[var(--color-text-secondary)]">
                        {t("folder.linkFiles", { count: l.file_count })}
                        {l.has_password && ` · ${t("folder.password")}`}
                        {" · "}
                        {formatDate(l.created_at)}
                      </span>
                      <IconButton
                        icon={Trash2}
                        label={t("folder.revokeLink")}
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
            <Button onClick={() => onOpenChange(false)}>{t("folder.done")}</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={creating}>
                {t("cancel")}
              </Button>
              <Button
                onClick={handleGenerate}
                disabled={
                  creating ||
                  subtreeIds === null ||
                  folderFiles.length === 0 ||
                  (usePassword && !password)
                }
              >
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5" />
                )}
                {creating
                  ? progress && progress.total > 1
                    ? t("folder.preparingN", { done: progress.done, total: progress.total })
                    : t("preparing")
                  : t("folder.create")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
