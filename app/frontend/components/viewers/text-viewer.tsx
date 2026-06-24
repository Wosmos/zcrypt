"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { hljsLanguageFor } from "@/components/viewers/viewer-kind";
import { cn } from "@/lib/utils";

const MAX_BYTES = 2 * 1024 * 1024; // cap highlighting/render of huge files

/**
 * Text/code viewer: monospace pane for the decrypted blob's text, with lazy
 * highlight.js syntax highlighting (language inferred from extension) and a
 * line-wrap toggle. Highlighted HTML comes ONLY from highlight.js over our own
 * text (no external markup), injected into a <code> block. Caps huge files.
 */
export function TextViewer({ blob, filename }: { blob: Blob; filename: string }) {
  const [text, setText] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wrap, setWrap] = useState(true);
  const truncated = blob.size > MAX_BYTES;

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setHighlighted(null);
    setError(null);
    (async () => {
      try {
        const slice = truncated ? blob.slice(0, MAX_BYTES) : blob;
        const raw = await slice.text();
        if (cancelled) return;
        setText(raw);

        const lang = hljsLanguageFor(filename);
        if (lang) {
          try {
            const { default: hljs } = await import("highlight.js");
            if (hljs.getLanguage(lang)) {
              const out = hljs.highlight(raw, { language: lang });
              if (!cancelled) setHighlighted(out.value);
            }
          } catch {
            // highlight failure → fall back to plain monospace text below
          }
        }
      } catch {
        if (!cancelled) setError("Could not read this file.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, filename, truncated]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-text-muted)]">
        <AlertCircle className="h-8 w-8 opacity-50" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  if (text === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <LogoSpinner size="sm" speed="fast" />
      </div>
    );
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
