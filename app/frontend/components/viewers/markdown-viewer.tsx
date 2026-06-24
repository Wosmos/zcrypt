"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";

/**
 * Markdown viewer: marked.parse on the decrypted blob's text → DOMPurify →
 * styled prose pane. Both libs lazy-imported. Sanitized markup is injected into
 * a div (never executed).
 */
export function MarkdownViewer({ blob }: { blob: Blob }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    (async () => {
      try {
        const text = await blob.text();
        const { marked } = await import("marked");
        const { default: DOMPurify } = await import("dompurify");
        // marked.parse can return string | Promise<string> depending on options.
        const parsed = await marked.parse(text, { async: true });
        const clean = DOMPurify.sanitize(parsed, {
          FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "style"],
          FORBID_ATTR: ["style", "srcdoc"],
        });
        if (!cancelled) setHtml(clean);
      } catch {
        if (!cancelled) setError("Could not render this Markdown file.");
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
    <div className="flex h-full w-full justify-center overflow-auto">
      <article
        className="prose-viewer my-6 w-full max-w-3xl rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-8 py-8 text-sm leading-relaxed text-[var(--color-text)] shadow-sm"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
