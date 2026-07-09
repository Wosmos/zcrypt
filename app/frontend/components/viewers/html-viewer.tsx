"use client";

import { useCallback } from "react";
import { ShieldCheck } from "@/lib/icons";
import { useDecodedBlob } from "@/hooks/useDecodedBlob";
import { ViewerLoading, ViewerError } from "./viewer-states";

/**
 * HTML viewer: reads the decrypted blob as text, sanitizes it with DOMPurify
 * (lazy-imported), then renders the result inside a sandboxed <iframe srcdoc>
 * with NO `allow-scripts` — so even if sanitization missed something, scripts
 * cannot execute and the frame is origin-isolated. A banner makes the
 * "scripts disabled for safety" guarantee explicit to the user.
 */
export function HtmlViewer({ blob }: { blob: Blob }) {
  const decode = useCallback(async (b: Blob) => {
    const raw = await b.text();
    const { default: DOMPurify } = await import("dompurify");
    // Sanitize as a full document so <head>/<style> are preserved but all
    // scripting + event handlers are stripped. Defense-in-depth on top of
    // the script-less iframe sandbox.
    return DOMPurify.sanitize(raw, {
      WHOLE_DOCUMENT: true,
      FORBID_TAGS: ["script", "iframe", "object", "embed", "base", "form"],
      FORBID_ATTR: ["srcdoc"],
    });
  }, []);
  const { value: html, error } = useDecodedBlob(blob, decode, "Could not render this HTML file.");

  if (error) return <ViewerError message={error} />;
  if (html === null) return <ViewerLoading />;

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
