"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Share2, Copy, Check, Link2, Lock, Trash2 } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createShare, listShares, revokeShare, getFileMeta } from "@/lib/api";
import { toast } from "@/store/toast";
import { usePassphraseStore } from "@/store/passphrase";
import { formatBytes, formatDate } from "@/lib/utils";
import type { ShareLink } from "@/types";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  fileId: string;
  fileName: string;
  fileSize: number;
}

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
  const [shares, setShares] = useState<ShareLink[]>([]);
  const [loadingShares, setLoadingShares] = useState(false);

  // The share key lives only in the URL fragment (#key=...) and is never sent
  // to the server, preserving zero-knowledge: the server stores only the CEK
  // wrapped under this key, which is useless without the fragment.
  const shareUrl = generatedToken && shareKeyB64
    ? `${window.location.origin}/s/${generatedToken}#key=${shareKeyB64}`
    : "";

  // Load existing shares
  useEffect(() => {
    if (!open || !fileId) return;
    setLoadingShares(true);
    listShares(fileId)
      .then(setShares)
      .catch(() => {})
      .finally(() => setLoadingShares(false));
  }, [open, fileId]);

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
      const { resolveFileKey, generateCEK, wrapKey, fromBase64, toBase64 } = await import("@/lib/crypto");

      // 1. Recover this file's CEK using the owner's passphrase.
      const meta = await getFileMeta(fileId);
      if (!meta.wrapped_cek) {
        throw new Error("This file was uploaded before sharing was supported. Re-upload it to share.");
      }
      const salt = fromBase64(meta.salt);
      // resolveFileKey returns the CEK for envelope files.
      const cekBuf = await resolveFileKey(passphrase, salt, meta.wrapped_cek);
      const cek = new Uint8Array(cekBuf);

      // 2. Wrap the CEK under a fresh random share key.
      const shareKey = generateCEK();
      const shareWrappedCek = await wrapKey(shareKey.buffer.slice(0) as ArrayBuffer, cek);

      // 3. Create the share storing only the share-wrapped CEK. The share key
      //    itself never leaves the browser except in the URL fragment below.
      const result = await createShare({
        file_id: fileId,
        wrapped_cek: toBase64(shareWrappedCek),
        password: usePassword ? password : undefined,
        expires_in_hours: expiryHours || undefined,
        max_downloads: maxDownloads || undefined,
      });

      setGeneratedToken(result.token);
      setShareKeyB64(toBase64(shareKey));
      setStep("link");
      toast.success("Share link created");
      // Refresh the (secondary) active-shares list. The share itself already
      // succeeded and its link is shown, so a failed refresh here is non-fatal
      // — log it rather than alarming the user or swallowing it silently.
      listShares(fileId)
        .then(setShares)
        .catch((err) => console.warn("share-modal: refresh shares failed", err));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create share");
    } finally {
      setLoading(false);
    }
  }, [fileId, usePassword, password, expiryHours, maxDownloads]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }, [shareUrl]);

  const handleRevoke = useCallback(async (shareId: string) => {
    try {
      await revokeShare(shareId);
      setShares((prev) => prev.map((s) => (s.id === shareId ? { ...s, revoked: true } : s)));
      toast.success("Share link revoked");
    } catch {
      toast.error("Failed to revoke");
    }
  }, []);

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
              <p className="text-xs text-[var(--color-text-muted)] truncate">{fileName} ({formatBytes(fileSize)})</p>
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
                          {s.expires_at && ` · Expires ${formatDate(s.expires_at)}`}
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
