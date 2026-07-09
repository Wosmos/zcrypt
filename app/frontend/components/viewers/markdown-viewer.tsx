"use client";

import { useCallback } from "react";
import { useDecodedBlob } from "@/hooks/useDecodedBlob";
import { ViewerLoading, ViewerError } from "./viewer-states";

/**
 * Markdown viewer: marked.parse on the decrypted blob's text → DOMPurify →
 * styled prose pane. Both libs lazy-imported. Sanitized markup is injected into
 * a div (never executed).
 */
export function MarkdownViewer({ blob }: { blob: Blob }) {
  const decode = useCallback(async (b: Blob) => {
    const text = await b.text();
    const { marked } = await import("marked");
    const { default: DOMPurify } = await import("dompurify");
    // marked.parse can return string | Promise<string> depending on options.
    const parsed = await marked.parse(text, { async: true });
    return DOMPurify.sanitize(parsed, {
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "style"],
      FORBID_ATTR: ["style", "srcdoc"],
    });
  }, []);
  const { value: html, error } = useDecodedBlob(blob, decode, "Could not render this Markdown file.");

  if (error) return <ViewerError message={error} />;
  if (html === null) return <ViewerLoading />;

  return (
    <div className="flex h-full w-full justify-center overflow-auto">
      <article
        className="prose-viewer my-6 w-full max-w-3xl rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-8 text-sm leading-relaxed text-[var(--color-text)] shadow-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
