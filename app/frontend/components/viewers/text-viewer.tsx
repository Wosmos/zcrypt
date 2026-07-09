"use client";

import { useCallback, useState } from "react";
import { hljsLanguageFor } from "@/components/viewers/viewer-kind";
import { cn } from "@/lib/utils";
import { useDecodedBlob } from "@/hooks/useDecodedBlob";
import { ViewerLoading, ViewerError } from "./viewer-states";

const MAX_BYTES = 2 * 1024 * 1024; // cap highlighting/render of huge files

/**
 * Text/code viewer: monospace pane for the decrypted blob's text, with lazy
 * highlight.js syntax highlighting (language inferred from extension) and a
 * line-wrap toggle. Highlighted HTML comes ONLY from highlight.js over our own
 * text (no external markup), injected into a <code> block. Caps huge files.
 */
export function TextViewer({ blob, filename }: { blob: Blob; filename: string }) {
  const [wrap, setWrap] = useState(true);
  const truncated = blob.size > MAX_BYTES;

  const decode = useCallback(
    async (b: Blob) => {
      const slice = truncated ? b.slice(0, MAX_BYTES) : b;
      const raw = await slice.text();

      let highlighted: string | null = null;
      const lang = hljsLanguageFor(filename);
      if (lang) {
        try {
          const { default: hljs } = await import("highlight.js");
          if (hljs.getLanguage(lang)) {
            highlighted = hljs.highlight(raw, { language: lang }).value;
          }
        } catch {
          // highlight failure → fall back to plain monospace text below
        }
      }
      return { raw, highlighted };
    },
    [filename, truncated]
  );
  const { value, error } = useDecodedBlob(blob, decode, "Could not read this file.");
  const text = value?.raw ?? null;
  const highlighted = value?.highlighted ?? null;

  if (error) return <ViewerError message={error} />;

  if (text === null) {
    return <ViewerLoading />;
  }

  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="flex shrink-0 items-center justify-between gap-2">
        {truncated ? (
          <p className="text-xs italic text-[var(--color-text-muted)]">
            Large file — showing the first 2&nbsp;MB.
          </p>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => setWrap((w) => !w)}
          className="rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--color-text-secondary)] outline-none transition-colors hover:bg-[var(--color-surface-1)] hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]"
        >
          {wrap ? "Wrap: on" : "Wrap: off"}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]">
        <pre
          className={cn(
            "p-4 text-xs leading-relaxed",
            wrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
          )}
        >
          {highlighted !== null ? (
            <code
              className="font-mono"
              // hljs output over our own plaintext only — no untrusted markup.
              dangerouslySetInnerHTML={{ __html: highlighted }}
            />
          ) : (
            <code className="font-mono text-[var(--color-text-secondary)]">{text}</code>
          )}
        </pre>
      </div>
    </div>
  );
}
