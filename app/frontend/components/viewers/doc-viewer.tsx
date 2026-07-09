"use client";

import { useCallback } from "react";
import { Download } from "@/lib/icons";
import { Button } from "@/components/ui/button";
import { useDecodedBlob } from "@/hooks/useDecodedBlob";
import { ViewerLoading, ViewerError } from "./viewer-states";

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
  const decode = useCallback(async (b: Blob) => {
    const arrayBuffer = await b.arrayBuffer();
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const { default: DOMPurify } = await import("dompurify");
    return DOMPurify.sanitize(result.value, {
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "style"],
      FORBID_ATTR: ["style", "srcdoc"],
    });
  }, []);
  const { value: html, error } = useDecodedBlob(blob, decode, "Could not render this document.");

  if (error) {
    return (
      <ViewerError message={error} gap="gap-3">
        <Button variant="secondary" size="sm" onClick={onDownload}>
          <Download className="h-3.5 w-3.5" />
          Download
        </Button>
      </ViewerError>
    );
  }

  if (html === null) return <ViewerLoading />;

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
