"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { IconButton } from "@/components/ui/icon-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { SkeletonText } from "@/components/ui/skeletons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import {
  Lock,
  Copy,
  Check,
  Layers,
  Key,
  Clock,
  HardDrive,
  Database,
  Share2,
  Link2,
  Plus,
  Cloud,
} from "@/lib/icons";
import {
  MetaRow,
  CopyField,
  EncryptionAssuranceCard,
  ShareLinkRow,
} from "@/components/files/details-shared";

/** Human label for a storage platform code (from FileMetadata.platform).
 *  Uses the shared platform name map; falls back to a capitalized raw id. */
function platformLabel(p: string): string {
  return PLATFORM_NAMES[p.toLowerCase()] ?? p.charAt(0).toUpperCase() + p.slice(1);
}
import { PLATFORM_NAMES } from "@/lib/platforms";
import { revokeShare, type FileMetaResponse } from "@/lib/api";
import { createFileShareLink } from "@/lib/file-share";
import { useSharesQuery, invalidateShares, useFileMetaQuery } from "@/hooks/useShares";
import { usePassphraseStore } from "@/store/passphrase";
import { toast } from "@/store/toast";
import { tr } from "@/store/translate";
import { copyToClipboard } from "@/lib/clipboard";
import {
  formatBytes,
  getFileTypeInfo,
  cn,
  savingsPercent,
  truncateMiddle,
  fileIconFor,
  EXPIRY_OPTIONS,
} from "@/lib/utils";
import type { FileMetadata, ShareLink } from "@/types";

const DOWNLOAD_LIMIT_OPTIONS = [0, 1, 5, 10, 25, 100];

interface DetailsDrawerProps {
  /** The file to inspect; `null` keeps the drawer closed. */
  file: FileMetadata | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DetailsDrawer({ file, open, onOpenChange }: DetailsDrawerProps) {
  const t = useTranslations("app.details");
  const te = useTranslations("app.expiry");
  const [tab, setTab] = useState<"details" | "sharing">("details");

  const fileId = file?.id ?? "";

  // ── Server meta + shares, cached by file id (shared with the share modal) ──
  // File metadata is immutable, so reopening a file's drawer never re-hits the
  // API; shares are invalidated on create/revoke below.
  const metaQuery = useFileMetaQuery(fileId, open);
  const meta: FileMetaResponse | null = metaQuery.data ?? null;
  const metaLoading = open && !!fileId && metaQuery.isPending;
  const metaError = metaQuery.error
    ? metaQuery.error instanceof Error
      ? metaQuery.error.message
      : tr("details.metaFailed")
    : null;
  const sharesQuery = useSharesQuery(fileId, open);
  const shares: ShareLink[] = sharesQuery.data ?? [];
  const sharesLoading = open && !!fileId && sharesQuery.isPending;

  // ── Sharing ──
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [usePassword, setUsePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [expiryHours, setExpiryHours] = useState(0);
  const [maxDownloads, setMaxDownloads] = useState(0);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ShareLink | null>(null);
  const [revoking, setRevoking] = useState(false);

  // Reset the drawer's UI state each time it opens for a file. Data (meta +
  // shares) is served from the cached queries above, no fetch here.
  useEffect(() => {
    if (!open || !fileId) return;
    // oxlint-disable-next-line react/set-state-in-effect
    setTab("details");
    setShowCreate(false);
    setNewLink(null);
  }, [open, fileId]);

  const resetCreateForm = useCallback(() => {
    setUsePassword(false);
    setPassword("");
    setExpiryHours(0);
    setMaxDownloads(0);
    setNewLink(null);
    setLinkCopied(false);
  }, []);

  const handleCreateShare = useCallback(async () => {
    const passphrase = usePassphraseStore.getState().getPassphrase();
    if (!passphrase) {
      toast.error(tr("details.passphraseLocked"));
      return;
    }
    setCreating(true);
    try {
      // Recover this file's CEK, re-wrap it under a fresh share key (which lives
      // only in the URL #fragment), create the share, and refresh the cache.
      const { url } = await createFileShareLink(fileId, {
        password: usePassword ? password : undefined,
        expiresHours: expiryHours,
        maxDownloads,
      });
      setNewLink(url);
      toast.success(tr("details.shareCreated"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("details.shareFailed"));
    } finally {
      setCreating(false);
    }
  }, [fileId, usePassword, password, expiryHours, maxDownloads]);

  const copyNewLink = useCallback(async () => {
    if (!newLink) return;
    const ok = await copyToClipboard(newLink);
    if (ok) {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } else {
      toast.error(tr("details.copyFailed"));
    }
  }, [newLink]);

  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeShare(revokeTarget.id);
      void invalidateShares(fileId);
      toast.success(tr("details.shareRevoked"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("details.revokeFailed"));
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  }, [revokeTarget, fileId]);

  if (!file) return null;

  const typeInfo = getFileTypeInfo(file.original_name);
  const Icon = fileIconFor(file.original_name);
  const savings = savingsPercent(file.original_size, file.encrypted_size);
  const shortSha = file.sha256 ? truncateMiddle(file.sha256, 16, 8) : "-";
  const activeShares = shares.filter((s) => !s.revoked);

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 border-l border-[var(--color-border)] bg-[var(--color-surface)] p-0 text-[var(--color-text)] sm:max-w-xl"
        >
          {/* Header */}
          <SheetHeader className="space-y-0 border-b border-[var(--color-border)] p-5 text-left">
            <div className="flex items-center gap-3 pr-8">
              <div
                className={cn(
                  "flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl",
                  typeInfo.bg,
                )}
              >
                {/* oxlint-disable-next-line react/static-components */}
                <Icon className={cn("h-5 w-5", typeInfo.color)} />
              </div>
              <div className="min-w-0">
                <SheetTitle
                  className="truncate text-base text-[var(--color-text)]"
                  title={file.original_name}
                >
                  {file.original_name}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <span>{typeInfo.label}</span>
                  <span aria-hidden>&middot;</span>
                  <span className="tabular-nums">{formatBytes(file.original_size)}</span>
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as "details" | "sharing")}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="px-5 pt-4">
              <TabsList className="grid w-full grid-cols-2 bg-[var(--color-surface-1)]">
                <TabsTrigger
                  value="details"
                  className="data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-text)]"
                >
                  {t("tabDetails")}
                </TabsTrigger>
                <TabsTrigger
                  value="sharing"
                  className="data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-text)]"
                >
                  {t("tabSharing")}
                  {activeShares.length > 0 && (
                    <span className="ml-1.5 rounded-full bg-[var(--color-accent)]/15 px-1.5 text-[10px] font-semibold tabular-nums text-[var(--color-accent)]">
                      {activeShares.length}
                    </span>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* ─────────── DETAILS ─────────── */}
            <TabsContent value="details" className="mt-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-5">
                {/* Core attributes */}
                <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
                  <MetaRow
                    label={t("originalSize")}
                    value={formatBytes(file.original_size)}
                    icon={HardDrive}
                  />
                  <MetaRow
                    label={t("encryptedSize")}
                    value={formatBytes(file.encrypted_size)}
                    icon={Lock}
                  />
                  <MetaRow
                    label={t("spaceSaved")}
                    value={
                      <span
                        className={
                          Number(savings) > 0
                            ? "text-[var(--color-accent)]"
                            : "text-[var(--color-text-muted)]"
                        }
                      >
                        {savings}%
                      </span>
                    }
                    icon={Database}
                  />
                  <MetaRow label={t("chunks")} value={file.chunk_count} icon={Layers} />
                  <MetaRow
                    label={t("created")}
                    value={
                      <span title={new Date(file.created_at).toLocaleString()}>
                        {new Date(file.created_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </span>
                    }
                    icon={Clock}
                  />
                  {file.platform && (
                    <MetaRow
                      label={t("storedOn")}
                      value={
                        <span className="rounded-md bg-[var(--color-surface-2)] px-2 py-0.5 text-xs font-medium text-[var(--color-text)]">
                          {platformLabel(file.platform)}
                        </span>
                      }
                      icon={Cloud}
                    />
                  )}
                </div>

                {/* Lazy server meta */}
                <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    <Key className="h-3.5 w-3.5" /> {t("integrity")}
                  </p>
                  {metaLoading ? (
                    <div className="space-y-2">
                      <SkeletonText w="w-2/3" />
                      <SkeletonText w="w-1/2" />
                    </div>
                  ) : metaError ? (
                    <p className="text-sm text-red-500">{metaError}</p>
                  ) : (
                    <>
                      <CopyField label="SHA-256" value={file.sha256 || meta?.sha256 || ""} mono />
                      {meta && (
                        <>
                          <MetaRow
                            label={t("compressedSize")}
                            value={formatBytes(meta.compressed_size)}
                          />
                          <MetaRow
                            label={t("status")}
                            value={<span className="capitalize">{meta.status || t("stored")}</span>}
                          />
                        </>
                      )}
                      <p className="pt-1 text-[11px] text-[var(--color-text-muted)]">
                        {t.rich("showing", {
                          code: (chunks) => <span className="font-mono">{chunks}</span>,
                          sha: shortSha,
                        })}
                      </p>
                    </>
                  )}
                </div>

                {/* Encryption assurance */}
                <EncryptionAssuranceCard title={t("fileEncTitle")} description={t("fileEncBody")} />
              </div>
            </TabsContent>

            {/* ─────────── SHARING ─────────── */}
            <TabsContent value="sharing" className="mt-0 flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-4">
                {/* Freshly created link */}
                {newLink && (
                  <div className="space-y-2 rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 p-3">
                    <div className="flex items-center gap-2">
                      <Link2 className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
                      <input
                        readOnly
                        value={newLink}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        className="min-w-0 flex-1 select-all bg-transparent font-mono text-xs text-[var(--color-text-secondary)] outline-none"
                      />
                      <IconButton
                        icon={linkCopied ? Check : Copy}
                        label={linkCopied ? t("copied") : t("copyLink")}
                        onClick={copyNewLink}
                        iconClassName={cn(
                          "h-3.5 w-3.5",
                          linkCopied && "text-[var(--color-accent)]",
                        )}
                        className="h-7 w-7 flex-shrink-0"
                      />
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">
                      {t.rich("fragmentNote", { b: (chunks) => <strong>{chunks}</strong> })}
                    </p>
                  </div>
                )}

                {/* Create form */}
                {showCreate ? (
                  <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
                    <label className="flex cursor-pointer items-center gap-2">
                      <Checkbox
                        checked={usePassword}
                        onCheckedChange={(checked) => setUsePassword(checked === true)}
                      />
                      <span className="text-sm">{t("passwordProtect")}</span>
                    </label>
                    {usePassword && (
                      <Input
                        type="password"
                        placeholder={t("sharePassword")}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        icon={<Lock className="h-4 w-4" />}
                      />
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                        {t("linkExpiry")}
                      </label>
                      <select
                        value={expiryHours}
                        onChange={(e) => setExpiryHours(Number(e.target.value))}
                        className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                      >
                        {EXPIRY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {te.has(String(opt.value)) ? te(String(opt.value)) : opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[var(--color-text-secondary)]">
                        {t("downloadLimit")}
                      </label>
                      <select
                        value={maxDownloads}
                        onChange={(e) => setMaxDownloads(Number(e.target.value))}
                        className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                      >
                        {DOWNLOAD_LIMIT_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt === 0 ? t("unlimited") : opt}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={handleCreateShare}
                        disabled={creating || (usePassword && !password)}
                        className="flex-1"
                      >
                        {creating ? (
                          <span className="flex items-center justify-center gap-2">
                            <LogoSpinner size={14} speed="fast" /> {t("generating")}
                          </span>
                        ) : (
                          t("generateLink")
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setShowCreate(false);
                          resetCreateForm();
                        }}
                        disabled={creating}
                      >
                        {t("cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      resetCreateForm();
                      setShowCreate(true);
                    }}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4" /> {t("createShareLink")}
                  </Button>
                )}

                {/* Active shares list */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    {t("activeLinks")}
                  </p>
                  {sharesLoading ? (
                    <div className="space-y-2">
                      <SkeletonText />
                      <SkeletonText w="w-3/4" />
                    </div>
                  ) : activeShares.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] py-8 text-center">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-surface-1)]">
                        <Share2 className="h-4 w-4 text-[var(--color-text-muted)]" />
                      </div>
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {t("noShareLinks")}
                      </p>
                      <p className="max-w-[220px] text-xs text-[var(--color-text-muted)]">
                        {t("noShareLinksHint")}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {activeShares.map((s) => (
                        <ShareLinkRow
                          key={s.id}
                          token={s.token}
                          hasPassword={s.has_password}
                          downloadCount={s.download_count}
                          maxDownloads={s.max_downloads}
                          expiresAt={s.expires_at}
                          containerClassName="bg-[var(--color-surface-1)]"
                          onRevoke={() => setRevokeTarget(s)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!revokeTarget}
        onOpenChange={(o) => {
          if (!o) setRevokeTarget(null);
        }}
        destructive
        title={t("revokeTitle")}
        description={t("revokeBody")}
        confirmLabel={t("revoke")}
        loading={revoking}
        onConfirm={handleRevoke}
      />
    </>
  );
}
