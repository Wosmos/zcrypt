"use client";

import { useEffect, useState } from "react";
import { AlertCircle, Download } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { Button } from "@/components/ui/button";

/**
 * DOCX viewer: mammoth.convertToHtml on the decrypted blob's ArrayBuffer →
 * DOMPurify.sanitize → rendered in a styled, scrollable reading pane. Both libs
 * are lazy-imported. The HTML is never executed (it's injected as sanitized
 * markup into a div, not an iframe — mammoth output is structural, no scripts).
 */
export function DocViewer({
  blob,
  onDownload,
}: {
  blob: Blob;
  onDownload: () => void;
}) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    (async () => {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const mammoth = await import("mammoth");
        const result = await mammoth.convertToHtml({ arrayBuffer });
        const { default: DOMPurify } = await import("dompurify");
        const clean = DOMPurify.sanitize(result.value, {
          FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "style"],
          FORBID_ATTR: ["style", "srcdoc"],
        });
        if (!cancelled) setHtml(clean);
      } catch {
        if (!cancelled) setError("Could not render this document.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
        <AlertCircle className="h-8 w-8 opacity-50" />
        <p className="text-sm">{error}</p>
        <Button variant="secondary" size="sm" onClick={onDownload}>
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
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
    <div className="flex h-full w-full justify-center overflow-auto">
      <article
        className="prose-viewer my-6 w-full max-w-3xl rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-10 text-sm leading-relaxed text-[var(--color-text)] shadow-sm"
        // Sanitized by DOMPurify above; mammoth emits structural markup only.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
