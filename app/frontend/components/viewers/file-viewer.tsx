"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  X,
  Download,
  ChevronLeft,
  ChevronRight,
  Monitor,
  RefreshCcw,
  AlertCircle,
  FileText,
} from "@/lib/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { getFileTypeInfo, cn } from "@/lib/utils";
import { mimeForFilename, WrongPasswordError, IntegrityError } from "@/hooks/useFileDecryptor";
import { FolderUnlockCancelled } from "@/hooks/useFolderProtection";
import { viewerKindFor, isMediaKind, type ViewerKind } from "@/components/viewers/viewer-kind";
import { ImageViewer } from "@/components/viewers/image-viewer";
import { PdfViewer } from "@/components/viewers/pdf-viewer";
import { DocViewer } from "@/components/viewers/doc-viewer";
import { HtmlViewer } from "@/components/viewers/html-viewer";
import { MarkdownViewer } from "@/components/viewers/markdown-viewer";
import { CsvViewer } from "@/components/viewers/csv-viewer";
import { TextViewer } from "@/components/viewers/text-viewer";
import { MediaViewer, type MediaTrack } from "@/components/viewers/media-viewer";
import type { FileMetadata } from "@/types";

/**
 * ── <FileViewer> — PUBLIC INTERFACE ──────────────────────────────────────────
 *
 *   <FileViewer
 *     open={boolean}                         // mount/show the overlay
 *     files={FileMetadata[]}                 // the navigable set (e.g. a folder)
 *     index={number}                         // currently-shown file's index
 *     onIndexChange={(index) => void}        // prev/next + playlist selection
 *     onClose={() => void}                   // Esc / close button / backdrop
 *     decrypt={(file) => Promise<Blob>}      // typically useFileDecryptor().decryptToBlob
 *     readOnly?={boolean}                    // hide nothing here, but reserved
 *   />
 *
 * A full-bleed modal overlay that decrypts and renders the file at `files[index]`
 * entirely in-browser:
 *   • Header: filename + type label, Fullscreen toggle (Fullscreen API on the
 *     overlay element), Download (re-decrypts if needed), Close.
 *   • Prev/Next across `files` (clamped) with a "3 / 18" counter — drives
 *     `onIndexChange`. Audio/video also expose a playlist of the other media
 *     files that calls `onIndexChange`.
 *   • Keyboard: Esc closes (exits fullscreen first if active), ←/→ prev/next,
 *     `f` toggles fullscreen. Focus is trapped inside the dialog and restored to
 *     the previously-focused element on close. role="dialog" + aria-modal.
 *   • Per-type rendering via `viewerKindFor`: image / video / audio / pdf / docx
 *     / html / markdown / csv / text — DOMPurify sanitization + a sandboxed
 *     (script-less) HTML iframe live in the sub-viewers. Unknown → fallback card.
 *   • Loading spinner while decrypting; error state with Retry + Download; wrong
 *     password is surfaced (the decryptor re-prompts via the existing flow).
 *   • Blob object URLs are created lazily and revoked on file change / close.
 *
 * The component owns NO decryption logic itself — it delegates to `decrypt`,
 * keeping zero-knowledge concerns in useFileDecryptor.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export interface FileViewerProps {
  /** Whether the overlay is shown. */
  open: boolean;
  /** The navigable set of files (prev/next + playlist walk this). */
  files: FileMetadata[];
  /** Index of the currently-displayed file within `files`. */
  index: number;
  /** Called to change the active file (prev/next, keyboard, playlist). */
  onIndexChange: (index: number) => void;
  /** Close the overlay (Esc, close button, backdrop). */
  onClose: () => void;
  /** Decrypt a file fully in-browser to a typed Blob. */
  decrypt: (file: FileMetadata) => Promise<Blob>;
  /** Reserved for trash/read-only contexts (no in-viewer mutation either way). */
  readOnly?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

type LoadState =
  | { status: "loading" }
  | { status: "ready"; blob: Blob }
  | { status: "error"; kind: "wrong-password" | "integrity" | "generic"; message: string }
  | { status: "cancelled" };

export function FileViewer({
  open,
  files,
  index,
  onIndexChange,
  onClose,
  decrypt,
}: FileViewerProps) {
  const file = files[index];
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [attempt, setAttempt] = useState(0); // bump to force a re-decrypt (Retry)

  const overlayRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  // Latest `decrypt` without making it an effect dependency: the prop's identity
  // changes on most renders (it closes over the non-memoized folderProtection),
  // and keying the decrypt effect on it would restart the decrypt every render —
  // leaving the viewer stuck "loading" and spawning overlapping decrypt runs.
  const decryptRef = useRef(decrypt);
  decryptRef.current = decrypt;

  const kind: ViewerKind = file ? viewerKindFor(file.original_name) : "fallback";

  // ── Blob URL lifecycle ──────────────────────────────────────────────────────
  const revokeUrl = useCallback(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setObjectUrl(null);
  }, []);

  // ── Decrypt the current file whenever it (or the retry attempt) changes ──────
  useEffect(() => {
    if (!open || !file) return;
    let cancelled = false;
    revokeUrl();
    setState({ status: "loading" });

    (async () => {
      try {
        const blob = await decryptRef.current(file);
        if (cancelled) return;
        // Some sub-viewers want a URL (image/video/audio/pdf), others read the
        // blob directly (docx/html/md/csv/text). Build the URL eagerly only for
        // the URL-consuming kinds.
        const k = viewerKindFor(file.original_name);
        if (k === "image" || k === "pdf" || isMediaKind(k)) {
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setObjectUrl(url);
        }
        setState({ status: "ready", blob });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof FolderUnlockCancelled) {
          setState({ status: "cancelled" });
          return;
        }
        if (err instanceof WrongPasswordError) {
          setState({
            status: "error",
            kind: "wrong-password",
            message: "Incorrect password. Try again to unlock this file.",
          });
          return;
        }
        if (err instanceof IntegrityError) {
          setState({
            status: "error",
            kind: "integrity",
            message: "File integrity check failed — the file may be corrupted.",
          });
          return;
        }
        setState({
          status: "error",
          kind: "generic",
          message: err instanceof Error ? err.message : "Could not open this file.",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
    // Keyed on the file IDENTITY (id) + retry, NOT on `decrypt` (unstable each
    // render) — so the decrypt runs once per opened file, not on every render.
  }, [open, file?.id, attempt]);

  // Revoke on unmount / close.
  useEffect(() => {
    if (!open) revokeUrl();
    return () => revokeUrl();
  }, [open, revokeUrl]);

  // ── Download (reuse the already-decrypted blob when available) ───────────────
  const handleDownload = useCallback(async () => {
    if (!file) return;
    try {
      const blob = state.status === "ready" ? state.blob : await decrypt(file);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.original_name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // a wrong-password/cancel here is surfaced by the main decrypt path
    }
  }, [file, state, decrypt]);

  // ── Navigation ───────────────────────────────────────────────────────────────
  const goPrev = useCallback(() => {
    if (files.length < 2) return;
    onIndexChange((index - 1 + files.length) % files.length);
  }, [files.length, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (files.length < 2) return;
    onIndexChange((index + 1) % files.length);
  }, [files.length, index, onIndexChange]);

  // ── Fullscreen API on the overlay element ────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    const node = overlayRef.current;
    if (!node) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
    } else {
      void node.requestFullscreen?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onFsChange = () => setIsFullscreen(document.fullscreenElement === overlayRef.current);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, [open]);

  // ── Keyboard: Esc / ← / → / f + focus trap ───────────────────────────────────
  const requestClose = useCallback(() => {
    if (document.fullscreenElement) {
      // Esc exits fullscreen first, then a second Esc closes (matches the spec).
      void document.exitFullscreen().catch(() => {});
      return;
    }
    onClose();
  }, [onClose]);

  // Global key handling while open: a document listener so Esc / ←/→ / f / Tab
  // keep working even after a sub-viewer mounts and focus moves off the overlay
  // (a React onKeyDown scoped to the overlay would go silent if focus escaped to
  // <body>). Esc closes (exits fullscreen first), arrows navigate, f toggles
  // fullscreen, Tab is trapped inside the dialog.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose();
        return;
      }
      const t = e.target as HTMLElement | null;
      const typing =
        !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (typing) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === "Tab") {
        const node = overlayRef.current;
        if (!node) return;
        const focusable = Array.from(
          node.querySelectorAll<HTMLElement>(FOCUSABLE)
        ).filter((el) => el.offsetParent !== null);
        if (focusable.length === 0) {
          e.preventDefault();
          node.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        const inside = !!active && node.contains(active) && active !== node;
        // Focus sitting on the overlay itself (or escaped) — pull it back in.
        if (!inside) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, requestClose, goPrev, goNext, toggleFullscreen]);

  // ── Focus management: capture/restore, focus the dialog on open ──────────────
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Focus the overlay so keyboard handlers fire immediately.
    const node = overlayRef.current;
    node?.focus();
    return () => {
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // ── Playlist tracks for the media viewer (other media files in `files`) ──────
  const mediaTracks: MediaTrack[] = useMemo(() => {
    if (!isMediaKind(kind)) return [];
    return files
      .map((f, i) => ({ file: f, index: i }))
      .filter((t) => isMediaKind(viewerKindFor(t.file.original_name)));
  }, [files, kind]);

  if (!open || !file) return null;

  const info = getFileTypeInfo(file.original_name);

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview: ${file.original_name}`}
      tabIndex={-1}
      className="panel fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]/95 outline-none backdrop-blur-sm"
    >
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-[var(--color-border)] px-4 py-3">
        <span
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            info.bg,
            info.color
          )}
        >
          <FileText className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-[var(--color-text)]">
            {file.original_name}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">{info.label}</p>
        </div>

        {files.length > 1 && (
          <span className="hidden select-none text-xs font-medium tabular-nums text-[var(--color-text-secondary)] sm:inline">
            {index + 1} / {files.length}
          </span>
        )}

        <div className="flex items-center gap-1">
          <IconButton
            icon={Monitor}
            label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
            iconClassName="h-4 w-4"
          />
          <IconButton
            icon={Download}
            label="Download"
            onClick={handleDownload}
            iconClassName="h-4 w-4"
          />
          <IconButton icon={X} label="Close" onClick={onClose} iconClassName="h-4 w-4" />
        </div>
      </header>

      {/* Body */}
      <div className="relative flex min-h-0 flex-1">
        {/* Prev / Next */}
        {files.length > 1 && (
          <>
            <div className="absolute left-3 top-1/2 z-10 -translate-y-1/2">
              <IconButton
                icon={ChevronLeft}
                label="Previous"
                onClick={goPrev}
                variant="secondary"
                className="h-10 w-10 rounded-full shadow-md"
                iconClassName="h-5 w-5"
              />
            </div>
            <div className="absolute right-3 top-1/2 z-10 -translate-y-1/2">
              <IconButton
                icon={ChevronRight}
                label="Next"
                onClick={goNext}
                variant="secondary"
                className="h-10 w-10 rounded-full shadow-md"
                iconClassName="h-5 w-5"
              />
            </div>
          </>
        )}

        <div className="min-h-0 flex-1 overflow-hidden p-4 sm:px-14">
          <ViewerBody
            file={file}
            kind={kind}
            state={state}
            objectUrl={objectUrl}
            onRetry={() => setAttempt((a) => a + 1)}
            onDownload={handleDownload}
            mediaTracks={mediaTracks}
            currentIndex={index}
            onSelectTrack={onIndexChange}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}

/* -------------------------------------------------------------------------- */
/* Body dispatcher                                                            */
/* -------------------------------------------------------------------------- */

function ViewerBody({
  file,
  kind,
  state,
  objectUrl,
  onRetry,
  onDownload,
  mediaTracks,
  currentIndex,
  onSelectTrack,
}: {
  file: FileMetadata;
  kind: ViewerKind;
  state: LoadState;
  objectUrl: string | null;
  onRetry: () => void;
  onDownload: () => void;
  mediaTracks: MediaTrack[];
  currentIndex: number;
  onSelectTrack: (index: number) => void;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <LogoSpinner size="md" speed="fast" />
        <p className="text-xs text-[var(--color-text-muted)]">Decrypting…</p>
      </div>
    );
  }

  if (state.status === "cancelled") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
        <AlertCircle className="h-9 w-9 opacity-40" />
        <p className="text-sm">Unlock cancelled.</p>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCcw className="h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-[var(--color-text-muted)]">
        <AlertCircle className="h-9 w-9 opacity-50 text-red-500" />
        <p className="max-w-sm text-sm text-[var(--color-text-secondary)]">{state.message}</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            <RefreshCcw className="h-3.5 w-3.5" />
            Retry
          </Button>
          <Button variant="ghost" size="sm" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>
    );
  }

  // state.status === "ready"
  const { blob } = state;
  const mime = mimeForFilename(file.original_name);

  switch (kind) {
    case "image":
      return objectUrl ? (
        <ImageViewer url={objectUrl} alt={file.original_name} />
      ) : null;

    case "pdf":
      return objectUrl ? (
        <PdfViewer url={objectUrl} filename={file.original_name} onDownload={onDownload} />
      ) : null;

    case "audio":
    case "video":
      return objectUrl ? (
        <MediaViewer
          src={objectUrl}
          filename={file.original_name}
          mime={mime}
          kind={kind}
          tracks={mediaTracks}
          currentIndex={currentIndex}
          onSelectTrack={onSelectTrack}
        />
      ) : null;

    case "docx":
      return <DocViewer blob={blob} onDownload={onDownload} />;

    case "html":
      return <HtmlViewer blob={blob} />;

    case "markdown":
      return <MarkdownViewer blob={blob} />;

    case "csv":
      return <CsvViewer blob={blob} filename={file.original_name} />;

    case "text":
      return <TextViewer blob={blob} filename={file.original_name} />;

    default:
      return <FallbackBody file={file} onDownload={onDownload} />;
  }
}

function FallbackBody({
  file,
  onDownload,
}: {
  file: FileMetadata;
  onDownload: () => void;
}) {
  const info = getFileTypeInfo(file.original_name);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div
        className={cn(
          "flex h-20 w-20 items-center justify-center rounded-2xl",
          info.bg,
          info.color
        )}
      >
        <FileText className="h-9 w-9" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium text-[var(--color-text)]">{file.original_name}</p>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          No preview available for this file type.
        </p>
      </div>
      <Button variant="primary" size="md" onClick={onDownload}>
        <Download className="h-4 w-4" />
        Download
      </Button>
    </div>
  );
}
