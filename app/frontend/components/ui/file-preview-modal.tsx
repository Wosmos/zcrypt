"use client";

import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { X, Download, FileText, Eye } from "@/lib/icons";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { formatBytes } from "@/lib/utils";

interface FilePreviewModalProps {
  open: boolean;
  onClose: () => void;
  blob: Blob | null;
  filename: string;
  fileSize: number;
}

function getPreviewType(filename: string): "image" | "text" | "pdf" | "none" {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if ([
    "txt", "md", "json", "js", "ts", "tsx", "jsx", "py", "go", "rs", "java",
    "c", "cpp", "h", "css", "html", "xml", "yaml", "yml", "toml", "sh", "bat",
    "env", "gitignore", "csv", "log", "cfg", "ini", "sql", "graphql",
  ].includes(ext)) return "text";
  return "none";
}

export function FilePreviewModal({ open, onClose, blob, filename, fileSize }: FilePreviewModalProps) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const previewType = getPreviewType(filename);

  // Generate preview URL when blob changes
  const generatePreview = useCallback(() => {
    if (!blob) return;

    if (previewType === "text") {
      const reader = new FileReader();
      reader.onload = () => setTextContent(reader.result as string);
      // Only read first 100KB for preview
      reader.readAsText(blob.slice(0, 100 * 1024));
    } else if (previewType === "image" || previewType === "pdf") {
      const url = URL.createObjectURL(blob);
      setObjectUrl(url);
    }
  }, [blob, previewType]);

  // Trigger preview generation when modal opens with new blob
  if (open && blob && !textContent && !objectUrl) {
    generatePreview();
  }

  const handleClose = useCallback(() => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      setObjectUrl(null);
    }
    setTextContent(null);
    onClose();
  }, [objectUrl, onClose]);

  const handleDownload = useCallback(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [blob, filename]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-3xl max-h-[85vh] mx-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-cyan-500/10 text-cyan-500 flex-shrink-0">
              <Eye className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold truncate">{filename}</h3>
              <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(fileSize)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 hover:bg-cyan-500/20 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Save
            </button>
            <button
              onClick={handleClose}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors p-1"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Preview content */}
        <div className="flex-1 overflow-auto p-5">
          {!blob ? (
            <div className="flex items-center justify-center h-40">
              <LogoSpinner size="sm" speed="fast" />
            </div>
          ) : previewType === "image" && objectUrl ? (
            <div className="flex items-center justify-center">
              <img
                src={objectUrl}
                alt={filename}
                className="max-w-full max-h-[60vh] rounded-lg object-contain"
              />
            </div>
          ) : previewType === "pdf" && objectUrl ? (
            <iframe
              src={objectUrl}
              className="w-full h-[60vh] rounded-lg border border-[var(--color-border)]"
              title={filename}
            />
          ) : previewType === "text" && textContent !== null ? (
            <pre className="text-xs font-mono leading-relaxed whitespace-pre-wrap break-all p-4 rounded-xl bg-[var(--color-surface-1)] border border-[var(--color-border)] max-h-[60vh] overflow-auto">
              {textContent}
              {blob.size > 100 * 1024 && (
                <span className="text-[var(--color-text-muted)] block mt-4 italic">
                  ... truncated (showing first 100KB of {formatBytes(blob.size)})
                </span>
              )}
            </pre>
          ) : (
            <div className="flex flex-col items-center justify-center h-40 text-[var(--color-text-muted)]">
              <FileText className="h-10 w-10 mb-3 opacity-40" />
              <p className="text-sm">Preview not available for this file type</p>
              <button
                onClick={handleDownload}
                className="mt-3 text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
              >
                Download to view
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

export function useFilePreview() {
  const [state, setState] = useState<{
    open: boolean;
    blob: Blob | null;
    filename: string;
    fileSize: number;
  }>({ open: false, blob: null, filename: "", fileSize: 0 });

  const openPreview = useCallback((blob: Blob | null, filename: string, fileSize: number) => {
    setState({ open: true, blob, filename, fileSize });
  }, []);

  const closePreview = useCallback(() => {
    setState({ open: false, blob: null, filename: "", fileSize: 0 });
  }, []);

  return { ...state, openPreview, closePreview };
}
