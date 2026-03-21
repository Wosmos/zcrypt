"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import {
  Shield, Lock, Copy, Check, Clock, Link2, FileText,
  AlertTriangle, CheckCircle2,
} from "@/lib/icons";
import { formatBytes } from "@/lib/utils";
import { createPad } from "@/lib/api";
import { QRShare } from "@/components/ui/qr-code";

const MAX_PAD_SIZE = 1024 * 1024; // 1 MB

type PadState = "editing" | "encrypting" | "done" | "error";

interface ExpiryOption {
  label: string;
  hours: number;
}

const EXPIRY_OPTIONS: ExpiryOption[] = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 168 },
];

export default function PadPage() {
  const [state, setState] = useState<PadState>("editing");
  const [text, setText] = useState("");
  const [burnAfterRead, setBurnAfterRead] = useState(false);
  const [expiryHours, setExpiryHours] = useState(24);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const textSize = new TextEncoder().encode(text).length;
  const isOverLimit = textSize > MAX_PAD_SIZE;

  const handleEncryptAndShare = useCallback(async () => {
    if (!text.trim() || isOverLimit) return;
    setState("encrypting");
    setErrorMsg("");

    try {
      const { encryptChunk, toBase64 } = await import("@/lib/crypto");

      // Generate random 256-bit key
      const randomKey = crypto.getRandomValues(new Uint8Array(32));
      const keyB64 = toBase64(randomKey);

      // Encrypt text directly with the random key (no PBKDF2 — it's a random key, not a passphrase)
      const plaintext = new TextEncoder().encode(text);
      const encrypted = await encryptChunk(randomKey.buffer as ArrayBuffer, plaintext);

      // Upload encrypted blob
      const { token } = await createPad({
        encrypted_blob: toBase64(encrypted),
        content_size: plaintext.byteLength,
        burn_after_read: burnAfterRead,
        expires_hours: expiryHours,
      });

      // Build share URL with key in fragment
      const url = `${window.location.origin}/pad/${token}#key=${keyB64}`;
      setShareUrl(url);
      setState("done");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create pad";
      setErrorMsg(msg);
      setState("error");
    }
  }, [text, isOverLimit, burnAfterRead, expiryHours]);

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = shareUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [shareUrl]);

  const handleReset = useCallback(() => {
    setState("editing");
    setText("");
    setShareUrl("");
    setErrorMsg("");
    setCopied(false);
  }, []);

  return (
    <div className="min-h-dvh flex items-center justify-center bg-[var(--color-bg)] p-4">
      <div className="w-full max-w-2xl animate-fade-in">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-accent)]/10">
            <FileText className="h-5 w-5 text-[var(--color-accent)]" />
          </div>
          <span className="text-xl font-bold font-heading tracking-tight">zcrypt Pad</span>
        </div>
        <p className="text-center text-sm text-[var(--color-text-muted)] mb-6">
          Share encrypted text. No account needed.
        </p>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl overflow-hidden">
          {/* Editing state */}
          {state === "editing" && (
            <div className="p-6 space-y-4">
              {/* Text area */}
              <div className="space-y-1.5">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type or paste your text here..."
                  className="w-full h-56 p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]/50 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/30 focus:border-[var(--color-accent)]/50 placeholder:text-[var(--color-text-muted)]"
                />
                <div className="flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
                  <span>{text.length} characters</span>
                  <span className={isOverLimit ? "text-red-500 font-medium" : ""}>
                    {formatBytes(textSize)} / {formatBytes(MAX_PAD_SIZE)}
                  </span>
                </div>
              </div>

              {/* Options */}
              <div className="space-y-3">
                {/* Expiry */}
                <div className="space-y-1.5">
                  <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                    <Clock className="h-3.5 w-3.5" />
                    Expires after
                  </label>
                  <div className="flex gap-2">
                    {EXPIRY_OPTIONS.map((opt) => (
                      <button
                        key={opt.hours}
                        onClick={() => setExpiryHours(opt.hours)}
                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-all ${
                          expiryHours === opt.hours
                            ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                            : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] text-[var(--color-text-muted)]"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Burn after read */}
                <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--color-border)] hover:border-[var(--color-border-hover)] cursor-pointer transition-colors">
                  <input
                    type="checkbox"
                    checked={burnAfterRead}
                    onChange={(e) => setBurnAfterRead(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative h-5 w-9 rounded-full bg-[var(--color-surface-1)] border border-[var(--color-border)] peer-checked:bg-[var(--color-accent)] peer-checked:border-[var(--color-accent)] transition-colors">
                    <div className={`absolute top-0.5 left-0.5 h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${burnAfterRead ? "translate-x-4" : ""}`} />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Burn after read</p>
                    <p className="text-xs text-[var(--color-text-muted)]">Text is deleted after first view</p>
                  </div>
                </label>
              </div>

              {/* Encrypt button */}
              <Button
                onClick={handleEncryptAndShare}
                disabled={!text.trim() || isOverLimit}
                className="w-full"
              >
                <Lock className="h-4 w-4 mr-2" />
                Encrypt &amp; Share
              </Button>

              <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
                <p className="text-xs text-cyan-700 dark:text-cyan-300">
                  Your text is encrypted in your browser. The encryption key is embedded in the share link — the server stores only encrypted data.
                </p>
              </div>
            </div>
          )}

          {/* Encrypting */}
          {state === "encrypting" && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <LogoSpinner size={32} speed="fast" />
              <p className="text-sm text-[var(--color-text-muted)]">Encrypting...</p>
            </div>
          )}

          {/* Done — show share link */}
          {state === "done" && (
            <div className="p-6 space-y-5">
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-cyan-500/10">
                  <CheckCircle2 className="h-6 w-6 text-cyan-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Pad Created</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1">
                    Share this link. Recipients can view the encrypted text in their browser.
                  </p>
                </div>
              </div>

              {/* Share URL */}
              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-secondary)]">
                  <Link2 className="h-3.5 w-3.5" />
                  Share Link
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 p-3 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] text-xs font-mono break-all select-all leading-relaxed">
                    {shareUrl}
                  </div>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={handleCopy}
                    className="flex-shrink-0 self-start"
                  >
                    {copied ? <Check className="h-4 w-4 text-cyan-500" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              {/* QR Code */}
              <QRShare url={shareUrl} />

              {/* Info badges */}
              <div className="flex gap-2 text-[10px] text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
                  <Clock className="h-3 w-3" />
                  Expires in {EXPIRY_OPTIONS.find(o => o.hours === expiryHours)?.label || `${expiryHours}h`}
                </span>
                {burnAfterRead && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-500">
                    <AlertTriangle className="h-3 w-3" />
                    Burns after read
                  </span>
                )}
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
                  <Shield className="h-3 w-3" />
                  E2E encrypted
                </span>
              </div>

              <Button variant="secondary" onClick={handleReset} className="w-full">
                <FileText className="h-4 w-4 mr-2" />
                Create Another Pad
              </Button>
            </div>
          )}

          {/* Error */}
          {state === "error" && (
            <div className="p-6">
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-red-500/10">
                  <AlertTriangle className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Failed</h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1 max-w-xs">{errorMsg}</p>
                </div>
                <Button variant="secondary" onClick={handleReset} className="mt-2">
                  Try Again
                </Button>
              </div>
            </div>
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
