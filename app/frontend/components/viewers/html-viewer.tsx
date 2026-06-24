"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, AlertCircle } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";

/**
 * HTML viewer: reads the decrypted blob as text, sanitizes it with DOMPurify
 * (lazy-imported), then renders the result inside a sandboxed <iframe srcdoc>
 * with NO `allow-scripts` — so even if sanitization missed something, scripts
 * cannot execute and the frame is origin-isolated. A banner makes the
 * "scripts disabled for safety" guarantee explicit to the user.
 */
export function HtmlViewer({ blob }: { blob: Blob }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    (async () => {
      try {
        const raw = await blob.text();
        const { default: DOMPurify } = await import("dompurify");
        // Sanitize as a full document so <head>/<style> are preserved but all
        // scripting + event handlers are stripped. Defense-in-depth on top of
        // the script-less iframe sandbox.
        const clean = DOMPurify.sanitize(raw, {
          WHOLE_DOCUMENT: true,
          FORBID_TAGS: ["script", "iframe", "object", "embed", "base", "form"],
          FORBID_ATTR: ["srcdoc"],
        });
        if (!cancelled) setHtml(clean);
      } catch {
        if (!cancelled) setError("Could not render this HTML file.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-text-muted)]">
        <AlertCircle className="h-8 w-8 opacity-50" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (html === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <LogoSpinner size="sm" speed="fast" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-1)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
        Rendered in an isolated sandbox. Scripts are disabled for your safety.
      </div>
      <iframe
        title="HTML preview"
        srcDoc={html}
        sandbox=""
        className="min-h-0 w-full flex-1 rounded-xl border border-[var(--color-border)] bg-white"
      />
    </div>
  );
}
