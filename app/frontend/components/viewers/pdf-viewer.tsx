"use client";

import { Download, ExternalLink } from "@/lib/icons";
import { IconButton } from "@/components/ui/icon-button";

/**
 * PDF viewer: renders the decrypted blob object URL in a sandboxed <iframe>
 * (no allow-scripts; no external network — the src is a local blob: URL).
 * Toolbar offers Download and Open-in-new-tab (the same blob URL).
 */
export function PdfViewer({
  url,
  filename,
  onDownload,
}: {
  url: string;
  filename: string;
  onDownload: () => void;
}) {
  return (
    <div className="flex h-full w-full flex-col gap-2">
      <div className="flex items-center justify-end gap-1">
        <IconButton
          icon={ExternalLink}
          label="Open in new tab"
          onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
          iconClassName="h-4 w-4"
        />
        <IconButton
          icon={Download}
          label="Download"
          onClick={onDownload}
          iconClassName="h-4 w-4"
        />
      </div>
      <iframe
        src={url}
        title={filename}
        sandbox=""
        className="min-h-0 w-full flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]"
      />
    </div>
  );
}
