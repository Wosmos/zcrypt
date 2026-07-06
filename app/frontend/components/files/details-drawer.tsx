"use client";

import { useCallback, useEffect, useState } from "react";
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
import { SkeletonText } from "@/components/ui/skeletons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
  Lock, Copy, Check, Layers, Key, Clock, HardDrive, Database, ShieldCheck,
  Share2, Link2, Trash2, Plus, Cloud,
} from "@/lib/icons";

/** Human label for a storage platform code (from FileMetadata.platform). */
const PLATFORM_LABELS: Record<string, string> = {
  telegram: "Telegram",
  github: "GitHub",
  gitlab: "GitLab",
  huggingface: "Hugging Face",
};
function platformLabel(p: string): string {
  return PLATFORM_LABELS[p.toLowerCase()] ?? p.charAt(0).toUpperCase() + p.slice(1);
}
import {
  getFileMeta, createShare, revokeShare,
  type FileMetaResponse,
} from "@/lib/api";
import { useSharesQuery, invalidateShares, useFileMetaQuery } from "@/hooks/useShares";
import { usePassphraseStore } from "@/store/passphrase";
import { toast } from "@/store/toast";
import { formatBytes, formatDate, getFileTypeInfo, cn } from "@/lib/utils";
import type { FileMetadata, ShareLink } from "@/types";

const iconMap: Record<string, typeof File> = {
  File, FileText, Image, Video, Music, Archive, Code, Cog, Table,
};

const EXPIRY_OPTIONS = [
  { label: "Never", value: 0 },
  { label: "1 hour", value: 1 },
  { label: "24 hours", value: 24 },
  { label: "7 days", value: 168 },
  { label: "30 days", value: 720 },
];

const DOWNLOAD_LIMIT_OPTIONS = [
  { label: "Unlimited", value: 0 },
  { label: "1", value: 1 },
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "25", value: 25 },
  { label: "100", value: 100 },
];

interface DetailsDrawerProps {
  /** The file to inspect; `null` keeps the drawer closed. */
  file: FileMetadata | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** A copyable monospace value with an IconButton copy affordance. */
function CopyField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [value]);

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-[var(--color-text-muted)]">{label}</span>
      <div className="flex min-w-0 items-center gap-1">
        <span className={cn("truncate text-sm text-[var(--color-text)]", mono && "font-mono text-xs")}>
          {value}
        </span>
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? "Copied" : `Copy ${label.toLowerCase()}`}
          onClick={copy}
          iconClassName={cn("h-3.5 w-3.5", copied && "text-[var(--color-accent)]")}
          className="h-7 w-7 flex-shrink-0"
        />
      </div>
    </div>
  );
}

/** A plain label/value row (no copy). */
function MetaRow({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: typeof File }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </span>
      <span className="truncate text-sm tabular-nums text-[var(--color-text)]">{value}</span>
    </div>
  );
}

export function DetailsDrawer({ file, open, onOpenChange }: DetailsDrawerProps) {
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
      : "Failed to load file metadata"
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
  // shares) is served from the cached queries above — no fetch here.
  useEffect(() => {
    if (!open || !fileId) return;
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
      toast.error("Your passphrase is locked. Open or download a file first to unlock it, then try sharing again.");
      return;
    }
    setCreating(true);
    try {
      const { resolveFileKey, generateCEK, wrapKey, fromBase64, toBase64 } = await import("@/lib/crypto");

      // Recover this file's CEK, then re-wrap it under a fresh share key. The
      // share key lives only in the URL #fragment and never reaches the server.
      const m = await getFileMeta(fileId);
      if (!m.wrapped_cek) {
        throw new Error("This file was uploaded before sharing was supported. Re-upload it to share.");
      }
      const salt = fromBase64(m.salt);
      const cekBuf = await resolveFileKey(passphrase, salt, m.wrapped_cek);
      const cek = new Uint8Array(cekBuf);

      const shareKey = generateCEK();
      const shareWrappedCek = await wrapKey(shareKey.buffer.slice(0) as ArrayBuffer, cek);

      const result = await createShare({
        file_id: fileId,
        wrapped_cek: toBase64(shareWrappedCek),
        password: usePassword ? password : undefined,
        expires_in_hours: expiryHours || undefined,
        max_downloads: maxDownloads || undefined,
      });

      const url = `${window.location.origin}/s/${result.token}#key=${toBase64(shareKey)}`;
      setNewLink(url);
      toast.success("Share link created");
      void invalidateShares(fileId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create share");
    } finally {
      setCreating(false);
    }
  }, [fileId, usePassword, password, expiryHours, maxDownloads]);

  const copyNewLink = useCallback(async () => {
    if (!newLink) return;
    try {
      await navigator.clipboard.writeText(newLink);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [newLink]);

  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeShare(revokeTarget.id);
      void invalidateShares(fileId);
      toast.success("Share link revoked");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke");
    } finally {
      setRevoking(false);
      setRevokeTarget(null);
    }
  }, [revokeTarget]);

  if (!file) return null;

  const typeInfo = getFileTypeInfo(file.original_name);
  const Icon = iconMap[typeInfo.icon] || File;
  const savings = file.original_size > 0
    ? Math.max(0, (1 - file.encrypted_size / file.original_size) * 100).toFixed(0)
    : "0";
  const shortSha = file.sha256 ? `${file.sha256.slice(0, 16)}…${file.sha256.slice(-8)}` : "—";
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
              <div className={cn("flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl", typeInfo.bg)}>
                <Icon className={cn("h-5 w-5", typeInfo.color)} />
              </div>
              <div className="min-w-0">
                <SheetTitle className="truncate text-base text-[var(--color-text)]" title={file.original_name}>
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

          <Tabs value={tab} onValueChange={(v) => setTab(v as "details" | "sharing")} className="flex min-h-0 flex-1 flex-col">
            <div className="px-5 pt-4">
              <TabsList className="grid w-full grid-cols-2 bg-[var(--color-surface-1)]">
                <TabsTrigger value="details" className="data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-text)]">
                  Details
                </TabsTrigger>
                <TabsTrigger value="sharing" className="data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-text)]">
                  Sharing
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
                  <MetaRow label="Original size" value={formatBytes(file.original_size)} icon={HardDrive} />
                  <MetaRow label="Encrypted size" value={formatBytes(file.encrypted_size)} icon={Lock} />
                  <MetaRow
                    label="Space saved"
                    value={
                      <span className={Number(savings) > 0 ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}>
                        {savings}%
                      </span>
                    }
                    icon={Database}
                  />
                  <MetaRow label="Chunks" value={file.chunk_count} icon={Layers} />
                  <MetaRow
                    label="Created"
                    value={
                      <span title={new Date(file.created_at).toLocaleString()}>
                        {new Date(file.created_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    }
                    icon={Clock}
                  />
                  {file.platform && (
                    <MetaRow
                      label="Stored on"
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
                    <Key className="h-3.5 w-3.5" /> Integrity
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
                          <MetaRow label="Compressed size" value={formatBytes(meta.compressed_size)} />
                          <MetaRow
                            label="Status"
                            value={<span className="capitalize">{meta.status || "stored"}</span>}
                          />
                        </>
                      )}
                      <p className="pt-1 text-[11px] text-[var(--color-text-muted)]">
                        Showing <span className="font-mono">{shortSha}</span>
                      </p>
                    </>
                  )}
                </div>

                {/* Encryption assurance */}
                <div className="flex items-start gap-3 rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5 p-4">
                  <ShieldCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      Encrypted &middot; AES-256-GCM
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      The decryption key never leaves your device. We only ever store ciphertext.
                    </p>
                  </div>
                </div>
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
                        label={linkCopied ? "Copied" : "Copy link"}
                        onClick={copyNewLink}
                        iconClassName={cn("h-3.5 w-3.5", linkCopied && "text-[var(--color-accent)]")}
                        className="h-7 w-7 flex-shrink-0"
                      />
                    </div>
                    <p className="text-[11px] text-[var(--color-text-secondary)]">
                      The link&apos;s <strong>#fragment</strong> holds the decryption key — anyone with the full
                      link can download and decrypt without a passphrase. The key never reaches our servers.
                    </p>
                  </div>
                )}

                {/* Create form */}
                {showCreate ? (
                  <div className="space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-4">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={usePassword}
                        onChange={(e) => setUsePassword(e.target.checked)}
                        className="rounded border-[var(--color-border)] accent-[var(--color-accent)]"
                      />
                      <span className="text-sm">Password protect</span>
                    </label>
                    {usePassword && (
                      <Input
                        type="password"
                        placeholder="Enter share password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        icon={<Lock className="h-4 w-4" />}
                      />
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[var(--color-text-secondary)]">Link expiry</label>
                      <select
                        value={expiryHours}
                        onChange={(e) => setExpiryHours(Number(e.target.value))}
                        className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                      >
                        {EXPIRY_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-[var(--color-text-secondary)]">Download limit</label>
                      <select
                        value={maxDownloads}
                        onChange={(e) => setMaxDownloads(Number(e.target.value))}
                        className="h-9 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                      >
                        {DOWNLOAD_LIMIT_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
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
                            <LogoSpinner size={14} speed="fast" /> Generating…
                          </span>
                        ) : (
                          "Generate link"
                        )}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => { setShowCreate(false); resetCreateForm(); }}
                        disabled={creating}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { resetCreateForm(); setShowCreate(true); }}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4" /> Create share link
                  </Button>
                )}

                {/* Active shares list */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Active links
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
                      <p className="text-sm text-[var(--color-text-secondary)]">No active share links</p>
                      <p className="max-w-[220px] text-xs text-[var(--color-text-muted)]">
                        Create a link to share this file without sharing your passphrase.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {activeShares.map((s) => (
                        <div
                          key={s.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <code className="truncate font-mono text-[11px] text-[var(--color-text-secondary)]">
                                …{s.token.slice(-8)}
                              </code>
                              {s.has_password && (
                                <Lock className="h-3 w-3 flex-shrink-0 text-amber-500" aria-label="Password protected" />
                              )}
                            </div>
                            <p className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
                              {s.download_count}{s.max_downloads > 0 ? `/${s.max_downloads}` : ""} downloads
                              {s.expires_at && ` · expires ${formatDate(s.expires_at)}`}
                            </p>
                          </div>
                          <IconButton
                            icon={Trash2}
                            label="Revoke link"
                            variant="ghost"
                            onClick={() => setRevokeTarget(s)}
                            iconClassName="h-3.5 w-3.5 text-red-500"
                            className="h-7 w-7 flex-shrink-0 hover:bg-red-500/10"
                          />
                        </div>
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
        onOpenChange={(o) => { if (!o) setRevokeTarget(null); }}
        destructive
        title="Revoke share link?"
        description="Anyone holding this link will immediately lose access to the file. This cannot be undone."
        confirmLabel="Revoke"
        loading={revoking}
        onConfirm={handleRevoke}
      />
    </>
  );
}
