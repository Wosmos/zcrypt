"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";

const MAX_BYTES = 4 * 1024 * 1024; // cap parsing of very large CSVs
const MAX_ROWS = 2000;

/**
 * Parse delimited text into rows of cells, honoring quoted fields that contain
 * the delimiter, embedded quotes ("") and newlines. Pure string work — no eval.
 */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // swallow — handled by the following \n (or end of input)
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * CSV/TSV viewer: parses the decrypted blob's text into a scrollable table.
 * Handles quoting/commas/newlines; caps very large files with a notice.
 */
export function CsvViewer({ blob, filename }: { blob: Blob; filename: string }) {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const truncatedBytes = blob.size > MAX_BYTES;

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setError(null);
    (async () => {
      try {
        const slice = truncatedBytes ? blob.slice(0, MAX_BYTES) : blob;
        const t = await slice.text();
        if (!cancelled) setText(t);
      } catch {
        if (!cancelled) setError("Could not read this file.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, truncatedBytes]);

  const delimiter = filename.toLowerCase().endsWith(".tsv") ? "\t" : ",";
  const rows = useMemo(
    () => (text === null ? [] : parseDelimited(text, delimiter)),
    [text, delimiter]
  );
  const truncatedRows = rows.length > MAX_ROWS;
  const shown = truncatedRows ? rows.slice(0, MAX_ROWS) : rows;
  const header = shown[0] ?? [];
  const body = shown.slice(1);

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
      {(truncatedBytes || truncatedRows) && (
        <p className="shrink-0 text-xs italic text-[var(--color-text-muted)]">
          Large file — showing the first {Math.min(rows.length, MAX_ROWS).toLocaleString()} rows.
        </p>
      )}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-[var(--color-border)]">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--color-surface-1)]">
            <tr>
              <th className="border-b border-[var(--color-border)] px-3 py-2 text-[var(--color-text-muted)]">
                #
              </th>
              {header.map((cell, i) => (
                <th
                  key={i}
                  className="border-b border-[var(--color-border)] px-3 py-2 font-semibold text-[var(--color-text)] whitespace-nowrap"
                >
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((cells, r) => (
              <tr key={r} className="even:bg-[var(--color-surface-1)]/40">
                <td className="px-3 py-1.5 text-[var(--color-text-muted)] tabular-nums">
                  {r + 1}
                </td>
                {cells.map((cell, c) => (
                  <td
                    key={c}
                    className="px-3 py-1.5 align-top text-[var(--color-text-secondary)]"
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
