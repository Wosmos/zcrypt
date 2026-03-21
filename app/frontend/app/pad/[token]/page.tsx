"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getPadInfo, getPadContent } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import {
  FileText, Copy, Check, AlertTriangle, CheckCircle2, Clock, Shield,
} from "@/lib/icons";
import { formatBytes } from "@/lib/utils";
import type { PadInfo } from "@/types";

type PageState = "loading" | "ready" | "decrypting" | "viewing" | "error";

function getKeyFromFragment(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash) return null;
  const match = hash.match(/key=([A-Za-z0-9+/=]+)/);
  return match ? match[1] : null;
}

function formatExpiry(expiresAt: string): string {
  const diff = new Date(expiresAt).getTime() - Date.now();
  if (diff <= 0) return "Expired";
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

export default function PadViewPage() {
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<PadInfo | null>(null);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [decryptedText, setDecryptedText] = useState("");
  const [encryptionKey, setEncryptionKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setEncryptionKey(getKeyFromFragment());
  }, []);

  useEffect(() => {
    if (!token) return;
    getPadInfo(token)
      .then((data) => {
        setInfo(data);
        if (!data.valid) {
          setPageState("error");
          setErrorMsg(data.reason || "This pad is no longer available");
        } else {
          setPageState("ready");
        }
      })
      .catch(() => {
        setPageState("error");
        setErrorMsg("Pad not found");
      });
  }, [token]);

  const handleDecrypt = useCallback(async () => {
    if (!token || !encryptionKey) return;
    setPageState("decrypting");
    setErrorMsg("");

    try {
      const { decryptChunk, fromBase64 } = await import("@/lib/crypto");

      const keyBytes = fromBase64(encryptionKey);
      const encryptedData = await getPadContent(token);
      const encrypted = new Uint8Array(encryptedData);

      let plaintext: Uint8Array;
      try {
        plaintext = await decryptChunk(keyBytes.buffer as ArrayBuffer, encrypted);
      } catch {
        throw new Error("Decryption failed — the link may be incomplete or corrupted");
      }

      const text = new TextDecoder().decode(plaintext);
      setDecryptedText(text);
      setPageState("viewing");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Decryption failed";
      setPageState("error");
      setErrorMsg(msg);
    }
  }, [token, encryptionKey]);

  const handleCopyText = useCallback(async () => {
    if (!decryptedText) return;
    try {
      await navigator.clipboard.writeText(decryptedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = decryptedText;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [decryptedText]);

  const noKey = pageState === "ready" && !encryptionKey;

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-2xl animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-accent)]/10">
            <FileText className="h-5 w-5 text-[var(--color-accent)]" />
          </div>
          <span className="text-xl font-bold font-heading tracking-tight">zcrypt Pad</span>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl overflow-hidden">
          {pageState === "loading" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <LogoSpinner size={32} />
              <p className="text-sm text-[var(--color-text-muted)]">Loading...</p>
            </div>
          )}

          {pageState === "error" && (
            <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-red-500/10">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <h2 className="text-lg font-semibold">Unavailable</h2>
              <p className="text-sm text-[var(--color-text-muted)] max-w-xs">{errorMsg}</p>
            </div>
          )}

          {noKey && (
            <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
              <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-amber-500/10">
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              </div>
              <h2 className="text-lg font-semibold">Incomplete Link</h2>
              <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
                This link is missing the encryption key. Make sure you copied the full URL including the <code className="text-[var(--color-text-secondary)]">#key=...</code> part.
              </p>
            </div>
          )}

          {pageState === "ready" && info && !noKey && (
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--color-accent)]/10 flex-shrink-0">
                  <FileText className="h-6 w-6 text-[var(--color-accent)]" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Encrypted Pad</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(info.content_size)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[10px] text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
                  <Clock className="h-3 w-3" />
                  Expires in {formatExpiry(info.expires_at)}
                </span>
                {info.burn_after_read && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-500">
                    <AlertTriangle className="h-3 w-3" />
                    Burns after view
                  </span>
                )}
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
                  <Shield className="h-3 w-3" />
                  E2E encrypted
                </span>
              </div>

              <Button onClick={handleDecrypt} className="w-full">
                <Shield className="h-4 w-4 mr-2" />
                Decrypt &amp; View
              </Button>

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                <p className="text-xs text-cyan-700 dark:text-cyan-300">
                  This text is end-to-end encrypted. Decryption happens entirely in your browser.
                </p>
              </div>
            </div>
          )}

          {pageState === "decrypting" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <LogoSpinner size={32} speed="fast" />
              <p className="text-sm text-[var(--color-text-muted)]">Decrypting...</p>
            </div>
          )}

          {pageState === "viewing" && (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-cyan-500" />
                  <p className="text-sm font-semibold">Decrypted</p>
                </div>
                <button
                  onClick={handleCopyText}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="p-5">
                <pre className="whitespace-pre-wrap break-words text-sm font-mono leading-relaxed text-[var(--color-text)] bg-[var(--color-surface-1)]/50 rounded-xl p-4 border border-[var(--color-border)] max-h-[60vh] overflow-y-auto">
                  {decryptedText}
                </pre>
              </div>
              <div className="px-5 py-3 border-t border-[var(--color-border)]">
                <p className="text-[10px] text-[var(--color-text-muted)]">
                  {formatBytes(new TextEncoder().encode(decryptedText).length)} &middot; Decrypted in browser
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[10px] text-[var(--color-text-muted)] mt-6">
          Powered by <span className="font-semibold">zcrypt</span> &middot; Zero-knowledge encrypted text sharing
        </p>
      </div>
    </div>
  );
}
