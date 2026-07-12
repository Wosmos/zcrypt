"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Share2, Copy, Check, Link2, Lock, Trash2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { revokeShare } from "@/lib/api";
import { useSharesQuery, invalidateShares } from "@/hooks/useShares";
import { toast } from "@/store/toast";
import { usePassphraseStore } from "@/store/passphrase";
import { createFileShareLink } from "@/lib/file-share";
import { copyToClipboard } from "@/lib/clipboard";
import { formatBytes, formatDateTime, midTrunc, EXPIRY_OPTIONS } from "@/lib/utils";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  fileSize: number;
}

const DOWNLOAD_LIMIT_OPTIONS = [
  { label: "Unlimited", value: 0 },
  { label: "1", value: 1 },
  { label: "5", value: 5 },
  { label: "10", value: 10 },
  { label: "25", value: 25 },
  { label: "100", value: 100 },
];

export function ShareModal({ open, onClose, fileId, fileName, fileSize }: ShareModalProps) {
  const [step, setStep] = useState<"form" | "link">("form");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);
  const [expiryHours, setExpiryHours] = useState(0);
  const [maxDownloads, setMaxDownloads] = useState(0);
  const [loading, setLoading] = useState(false);
  const [generatedToken, setGeneratedToken] = useState("");
  const [shareKeyB64, setShareKeyB64] = useState("");
  const [copied, setCopied] = useState(false);
  // Share list cached by file id (shared with the details drawer). No refetch on
  // reopen; create/revoke below invalidate it.
  const { data: shares = [], isPending: sharesPending } = useSharesQuery(fileId, open);
  const loadingShares = open && !!fileId && sharesPending;

  // The share key lives only in the URL fragment (#key=...) and is never sent
  // to the server, preserving zero-knowledge: the server stores only the CEK
  // wrapped under this key, which is useless without the fragment.
  const shareUrl = generatedToken && shareKeyB64
    ? `${window.location.origin}/s/${generatedToken}#key=${shareKeyB64}`
    : "";

  // Reset on close
  useEffect(() => {
    if (!open) {
      setStep("form");
      setPassword("");
      setUsePassword(false);
      setExpiryHours(0);
      setMaxDownloads(0);
      setGeneratedToken("");
      setShareKeyB64("");
      setCopied(false);
    }
  }, [open]);

  const handleGenerate = useCallback(async () => {
    // Sharing needs the passphrase to recover the file's CEK so it can be
    // re-wrapped under a share key. The recipient then needs only the link.
    const passphrase = usePassphraseStore.getState().getPassphrase();
    if (!passphrase) {
      toast.error("Your passphrase is locked. Open or download a file first to unlock it, then try sharing again.");
      return;
    }

    setLoading(true);
    try {
      // Recover the CEK, re-wrap it under a fresh share key, and create the
      // share — the share key never leaves the browser except in the URL
      // fragment. createFileShareLink also refreshes the shares cache so this
      // modal + the details drawer show the new link.
      const { token, shareKey } = await createFileShareLink(fileId, {
        password: usePassword ? password : undefined,
        expiresHours: expiryHours || undefined,
        maxDownloads: maxDownloads || undefined,
      });

      setGeneratedToken(token);
      setShareKeyB64(shareKey);
      setStep("link");
      toast.success("Share link created");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create share");
    } finally {
      setLoading(false);
    }
  }, [fileId, usePassword, password, expiryHours, maxDownloads]);

  const handleCopy = useCallback(async () => {
    if (await copyToClipboard(shareUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      toast.error("Failed to copy");
    }
  }, [shareUrl]);

  const handleRevoke = useCallback(async (shareId: string) => {
    try {
      await revokeShare(shareId);
      void invalidateShares(fileId);
      toast.success("Share link revoked");
    } catch {
      toast.error("Failed to revoke");
    }
  }, [fileId]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] mx-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-cyan-500/10 text-cyan-500 flex-shrink-0">
              <Share2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">Share File</h3>
              <p className="text-xs text-[var(--color-text-muted)] truncate">{midTrunc(fileName, 18, 8)} ({formatBytes(fileSize)})</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {step === "form" ? (
            <>
              {/* Password toggle */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={usePassword}
                    onCheckedChange={(checked) => setUsePassword(checked === true)}
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
              </div>

              {/* Expiry */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-text-secondary)]">Link expiry</label>
                <select
                  value={expiryHours}
                  onChange={(e) => setExpiryHours(Number(e.target.value))}
                  className="w-full h-[38px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                >
                  {EXPIRY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Max downloads */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-text-secondary)]">Download limit</label>
                <select
                  value={maxDownloads}
                  onChange={(e) => setMaxDownloads(Number(e.target.value))}
                  className="w-full h-[38px] px-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30"
                >
                  {DOWNLOAD_LIMIT_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <Button
                onClick={handleGenerate}
                disabled={loading || (usePassword && !password)}
                className="w-full"
              >
                {loading ? "Generating..." : "Generate Link"}
              </Button>
            </>
          ) : (
            <>
              {/* Generated link */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]">
                  <Link2 className="h-4 w-4 text-[var(--color-accent)] flex-shrink-0" />
                  <input
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-transparent text-xs font-mono text-[var(--color-text-secondary)] outline-none select-all"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors flex-shrink-0"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>

                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    This link contains the decryption key in its <strong>#fragment</strong> — anyone with the full link can download <em>and</em> decrypt the file, with no passphrase needed. The key never reaches our servers. Share the link only with people you trust, and use a password or expiry for extra safety.
                  </p>
                </div>

                <Button onClick={() => setStep("form")} variant="secondary" className="w-full">
                  Create Another Link
                </Button>
              </div>
            </>
          )}

          {/* Existing shares */}
          {shares.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[var(--color-border)]">
              <h4 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Active Shares</h4>
              {loadingShares ? (
                <p className="text-xs text-[var(--color-text-muted)]">Loading...</p>
              ) : (
                <div className="space-y-1.5">
                  {shares.map((s) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <code className="text-[10px] font-mono text-[var(--color-text-muted)] truncate max-w-[120px]">
                            ...{s.token.slice(-8)}
                          </code>
                          {s.has_password && <Lock className="h-3 w-3 text-amber-500" />}
                          {s.revoked && (
                            <span className="text-[10px] font-medium text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded">Revoked</span>
                          )}
                        </div>
                        <p className="text-[10px] text-[var(--color-text-muted)]">
                          {s.download_count}{s.max_downloads > 0 ? `/${s.max_downloads}` : ""} downloads
                          {s.expires_at && ` · Expires ${formatDateTime(s.expires_at)}`}
                        </p>
                      </div>
                      {!s.revoked && (
                        <button
                          onClick={() => handleRevoke(s.id)}
                          className="flex items-center justify-center h-7 w-7 rounded-lg text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-colors flex-shrink-0"
                          title="Revoke"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
