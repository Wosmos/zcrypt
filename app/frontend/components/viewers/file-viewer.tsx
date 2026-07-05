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
import { motion, useReducedMotion } from "motion/react";
import { getFileTypeInfo, cn } from "@/lib/utils";
import { mimeForFilename, WrongPasswordError, IntegrityError } from "@/hooks/useFileDecryptor";
import { FolderUnlockCancelled } from "@/hooks/useFolderProtection";
import { useThumbnail } from "@/hooks/useThumbnail";
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
  /**
   * Decrypt a file fully in-browser to a typed Blob. The optional second
   * argument receives chunk-level progress (drives the "Decrypting… X/Y" UI);
   * callers passing a single-arg function remain compatible.
   */
  decrypt: (
    file: FileMetadata,
    onProgress?: (done: number, total: number) => void
  ) => Promise<Blob>;
  /**
   * Optional best-effort cache warm-up for a file (never prompts). When given,
   * the viewer prefetches the next/previous file so navigation is instant.
   * Typically `useFileDecryptor().prefetch`.
   */
  prefetch?: (file: FileMetadata) => void;
  /**
   * Called when a decrypt fails because the cached password is wrong, with the
   * offending folder id (null = the vault). The consumer should clear that
   * cached password so the user's Retry re-prompts instead of silently reusing
   * the same wrong password (the vault unlock has no verifier, so a wrong vault
   * passphrase would otherwise loop until the TTL).
   */
  onWrongPassword?: (folderId: string | null) => void;
  /** Reserved for trash/read-only contexts (no in-viewer mutation either way). */
  readOnly?: boolean;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

type LoadState =
  // `done`/`total` are chunk counts from the decrypt pipeline — undefined until
  // the first chunk lands (metadata / key derivation still in flight).
  | { status: "loading"; done?: number; total?: number }
  | { status: "ready"; blob: Blob }
  | { status: "error"; kind: "wrong-password" | "integrity" | "generic"; message: string }
  | { status: "cancelled" }
  // Non-previewable type (archive, binary, …): intentionally NOT decrypted on
  // open — the download card is shown instead, and Download decrypts on demand.
  | { status: "skipped" };

export function FileViewer({
  open,
  files,
  index,
  onIndexChange,
  onClose,
  decrypt,
  prefetch,
  onWrongPassword,
}: FileViewerProps) {
  const file = files[index];
  // Cached thumbnail (if any) for the current image — drives the instant blurred
  // placeholder while the full file decrypts (LQIP). Null for non-images.
  const { thumbnailUrl } = useThumbnail(file?.id ?? "", file?.original_name ?? "");
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
  // Same treatment for the optional prefetch callback (also closes over the
  // non-memoized folderProtection, so its identity changes each render).
  const prefetchRef = useRef(prefetch);
  prefetchRef.current = prefetch;
  const onWrongPasswordRef = useRef(onWrongPassword);
  onWrongPasswordRef.current = onWrongPassword;

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

    // Non-previewable types have no in-browser viewer, so decrypting on open
    // would grind through the entire file (hundreds of chunks for a large .zip)
    // only to land on the "No preview available" card. Skip it — the download
    // action decrypts on demand instead.
    if (viewerKindFor(file.original_name) === "fallback") {
      setState({ status: "skipped" });
      return;
    }

    // Seed the total from the file's chunk count so the progress bar shows
    // "0/N" immediately, instead of a blind spinner until the first chunk lands.
    setState({ status: "loading", done: 0, total: file.chunk_count });

    (async () => {
      try {
        // Chunk-level progress feeds the "Decrypting… X/Y" loading UI. Only
        // update while still loading (a stale callback after ready/error would
        // otherwise resurrect the spinner).
        const blob = await decryptRef.current(file, (done, total) => {
          if (cancelled) return;
          setState((s) =>
            s.status === "loading" ? { status: "loading", done, total } : s
          );
        });
        if (cancelled) return;
        // Some sub-viewers want a URL (image/video/audio), others read the blob
        // directly (pdf via pdf.js, docx/html/md/csv/text). Build the URL eagerly
        // only for the URL-consuming kinds.
        const k = viewerKindFor(file.original_name);
        if (k === "image" || isMediaKind(k)) {
          const url = URL.createObjectURL(blob);
          blobUrlRef.current = url;
          setObjectUrl(url);
        }
        setState({ status: "ready", blob });
        // Warm the immediate neighbours so prev/next is instant. Best-effort and
        // deduped by the decrypt cache; never prompts (see useFileDecryptor). The
        // effect re-runs per file id, so `files`/`index` are current here.
        const pf = prefetchRef.current;
        if (pf && files.length > 1) {
          pf(files[(index + 1) % files.length]);
          pf(files[(index - 1 + files.length) % files.length]);
        }
      } catch (err) {
        if (cancelled) return;
        if (err instanceof FolderUnlockCancelled) {
          setState({ status: "cancelled" });
          return;
        }
        if (err instanceof WrongPasswordError) {
          // Clear the wrong cached password (via the consumer) so Retry re-prompts
          // instead of reusing it forever — the vault unlock has no verifier.
          onWrongPasswordRef.current?.(err.folderId);
          setState({
            status: "error",
            kind: "wrong-password",
            message: "Incorrect password. Click Retry to re-enter it.",
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
    // `files`/`index` are read for prefetch but intentionally omitted: the effect
    // already re-runs on every navigation (file.id changes), so they're current.
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
            thumbnailUrl={thumbnailUrl}
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
  thumbnailUrl,
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
  thumbnailUrl: string | null;
  onRetry: () => void;
  onDownload: () => void;
  mediaTracks: MediaTrack[];
  currentIndex: number;
  onSelectTrack: (index: number) => void;
}) {
  // Non-previewable types are never decrypted (the viewer effect short-circuits
  // to "skipped"), so show the download card straight away rather than a spinner
  // that would never resolve.
  if (kind === "fallback") {
    return <FallbackBody file={file} onDownload={onDownload} />;
  }

  if (state.status === "loading") {
    // For an image with a cached thumbnail, show it blurred immediately (instead
    // of a bare spinner) so the decrypt wait feels instant — it then crossfades
    // to the full image once ready (see ImageViewer's placeholderUrl).
    if (kind === "image" && thumbnailUrl) {
      return (
        <div className="relative flex h-full w-full items-center justify-center overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl}
            alt=""
            aria-hidden
            className="h-full w-full scale-105 object-contain opacity-60 blur-xl"
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <LogoSpinner size="md" speed="fast" />
            <DecryptProgress done={state.done} total={state.total} />
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <LogoSpinner size="md" speed="fast" />
        <DecryptProgress done={state.done} total={state.total} />
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

  // "skipped" only ever pairs with a fallback kind (handled at the top), but
  // guard it so the ready-path narrowing holds.
  if (state.status === "skipped") {
    return <FallbackBody file={file} onDownload={onDownload} />;
  }

  // state.status === "ready"
  const { blob } = state;
  const mime = mimeForFilename(file.original_name);

  switch (kind) {
    case "image":
      return objectUrl ? (
        <ImageViewer
          url={objectUrl}
          alt={file.original_name}
          placeholderUrl={thumbnailUrl ?? undefined}
        />
      ) : null;

    case "pdf":
      return <PdfViewer blob={blob} filename={file.original_name} onDownload={onDownload} />;

    case "audio":
    case "video":
      return objectUrl ? (
        <MediaViewer
          src={objectUrl}
          filename={file.original_name}
          mime={mime}
          kind={kind}
          poster={thumbnailUrl ?? undefined}
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

/**
 * Progressive decrypt indicator. Multi-chunk files get a determinate bar with
 * "X/Y · NN%" that fills as chunks land (total is seeded from chunk_count, so it
 * appears immediately). A single large chunk has no sub-progress, so it shows an
 * indeterminate sweeping bar instead of a frozen 0% — the wait still feels alive.
 */
function DecryptProgress({ done, total }: { done?: number; total?: number }) {
  const reduce = useReducedMotion() ?? false;
  const determinate = total !== undefined && total > 1;
  const pct = determinate ? Math.round(((done ?? 0) / (total as number)) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
        {determinate ? `Decrypting… ${done ?? 0}/${total} · ${pct}%` : "Decrypting…"}
      </p>
      <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[var(--color-surface-2)]">
        {determinate ? (
          <div
            className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        ) : reduce ? (
          <div className="h-full w-1/3 rounded-full bg-[var(--color-accent)]" />
        ) : (
          <motion.div
            className="h-full w-1/3 rounded-full bg-[var(--color-accent)]"
            animate={{ x: ["-120%", "360%"] }}
            transition={{ duration: 1.1, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
    </div>
  );
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
