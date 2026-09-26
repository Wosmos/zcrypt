"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Share2, Copy, Check, Link2, AlertTriangle } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { createFileShareLink } from "@/lib/file-share";
import { copyToClipboard } from "@/lib/clipboard";
import { usePassphraseStore } from "@/store/passphrase";
import { toast } from "@/store/toast";
import { midTrunc } from "@/lib/utils";
import type { FileMetadata } from "@/types";

interface BulkShareModalProps {
  open: boolean;
  onClose: () => void;
  files: FileMetadata[];
}

interface ShareResult {
  fileId: string;
  fileName: string;
  url?: string;
  error?: string;
}

const DEFAULT_EXPIRY_HOURS = 0;

export function BulkShareModal({ open, onClose, files }: BulkShareModalProps) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ShareResult[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setResults([]);
      setLoading(false);
      setCopiedId(null);
      return;
    }

    const passphrase = usePassphraseStore.getState().getPassphrase();
    if (!passphrase) {
      toast.error(
        "Your passphrase is locked. Open or download a file first to unlock it, then try sharing again.",
      );
      onClose();
      return;
    }

    setLoading(true);
    void Promise.allSettled(
      files.map((f) =>
        createFileShareLink(f.id, { expiresHours: DEFAULT_EXPIRY_HOURS || undefined }),
      ),
    ).then((settled) => {
      setResults(
        settled.map((r, i) => {
          const file = files[i];
          if (r.status === "fulfilled") {
            const url = `${window.location.origin}/s/${r.value.token}#key=${r.value.shareKey}`;
            return { fileId: file.id, fileName: file.original_name, url };
          }
          return {
            fileId: file.id,
            fileName: file.original_name,
            error: r.reason instanceof Error ? r.reason.message : "Failed to create share",
          };
        }),
      );
      setLoading(false);
    });
    // Runs once per open (files is the selection at the moment the modal opened).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleCopy = async (url: string, fileId: string) => {
    if (await copyToClipboard(url)) {
      setCopiedId(fileId);
      setTimeout(() => setCopiedId((cur) => (cur === fileId ? null : cur)), 2000);
    } else {
      toast.error("Failed to copy");
    }
  };

  const handleCopyAll = async () => {
    const urls = results
      .filter((r): r is ShareResult & { url: string } => !!r.url)
      .map((r) => r.url)
      .join("\n");
    if (await copyToClipboard(urls)) {
      toast.success("Copied all links");
    } else {
      toast.error("Failed to copy");
    }
  };

  if (!open) return null;

  const succeeded = results.filter((r) => r.url).length;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="mx-4 flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-500">
              <Share2 className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">Share {files.length} files</h3>
              {!loading && (
                <p className="truncate text-xs text-[var(--color-text-muted)]">
                  {succeeded} of {files.length} link{files.length !== 1 ? "s" : ""} created
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-auto p-5">
          {loading ? (
            <p className="text-sm text-[var(--color-text-muted)]">Creating links…</p>
          ) : (
            results.map((r) => (
              <div
                key={r.fileId}
                className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)] p-3"
              >
                {r.url ? (
                  <>
                    <Link2 className="h-4 w-4 flex-shrink-0 text-[var(--color-accent)]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{midTrunc(r.fileName, 18, 8)}</p>
                      <p className="truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                        {r.url}
                      </p>
                    </div>
                    <button
                      onClick={() => handleCopy(r.url!, r.fileId)}
                      className="flex flex-shrink-0 items-center gap-1 rounded-lg bg-[var(--color-accent)]/10 px-2 py-1 text-xs font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent)]/20"
                    >
                      {copiedId === r.fileId ? (
                        <Check className="h-3.5 w-3.5" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {copiedId === r.fileId ? "Copied" : "Copy"}
                    </button>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-4 w-4 flex-shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium">{midTrunc(r.fileName, 18, 8)}</p>
                      <p className="truncate text-[10px] text-amber-600 dark:text-amber-400">
                        {r.error}
                      </p>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        {!loading && succeeded > 1 && (
          <div className="border-t border-[var(--color-border)] p-5 pt-3">
            <Button onClick={handleCopyAll} variant="secondary" className="w-full">
              Copy all links
            </Button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
