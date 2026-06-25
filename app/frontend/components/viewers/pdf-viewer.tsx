"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask,
} from "pdfjs-dist";
import {
  Download,
  ExternalLink,
  Plus,
  ChevronDown,
  RefreshCcw,
  AlertCircle,
} from "@/lib/icons";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";

/**
 * In-app PDF viewer built on pdf.js (pdfjs-dist). Pages are rendered to <canvas>
 * entirely in the browser — no <iframe>, no browser PDF plugin — so it renders
 * consistently across Chrome / Firefox / Safari and inside the Tauri webview,
 * and is never "blocked by Chrome" the way a sandboxed plugin iframe is.
 *
 * The worker is bundled locally (no CDN / external network), preserving the
 * zero-knowledge guarantee: the decrypted PDF bytes never leave the page.
 *
 * Pages render lazily (IntersectionObserver) so large documents stay responsive,
 * and re-render crisply on zoom. A blob: URL is created only for the optional
 * "open in new tab" fallback (a top-level tab is not sandboxed, so the browser's
 * native viewer works there).
 */

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
// Fallback page aspect (US Letter) used to size placeholders before a page's
// real dimensions are known, so the scroll height doesn't jump on first paint.
const FALLBACK_ASPECT = 11 / 8.5;

let workerConfigured = false;

/** Configure the pdf.js worker once, from the locally-bundled worker asset. */
async function loadPdfjs() {
  const pdfjs = await import("pdfjs-dist");
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/build/pdf.worker.min.mjs",
      import.meta.url
    ).toString();
    workerConfigured = true;
  }
  return pdfjs;
}

export function PdfViewer({
  blob,
  filename,
  onDownload,
}: {
  blob: Blob;
  filename: string;
  onDownload: () => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);

  // A blob: URL only for the "open in new tab" fallback (the native viewer works
  // in a top-level tab, which isn't sandboxed). Revoked on unmount / blob change.
  const externalUrl = useMemo(() => URL.createObjectURL(blob), [blob]);
  useEffect(() => () => URL.revokeObjectURL(externalUrl), [externalUrl]);

  // ── Load the document from the decrypted blob ────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setDoc(null);
    setNumPages(0);
    setError(false);
    setCurrentPage(1);

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const data = new Uint8Array(await blob.arrayBuffer());
        const task = pdfjs.getDocument({ data });
        const pdf = await task.promise;
        if (cancelled) {
          void pdf.loadingTask.destroy();
          return;
        }
        loaded = pdf;
        setDoc(pdf);
        setNumPages(pdf.numPages);
      } catch {
        if (!cancelled) setError(true);
      }
    })();

    return () => {
      cancelled = true;
      void loaded?.loadingTask.destroy();
    };
  }, [blob]);

  // ── Track the scroll container's width (drives fit-to-width) ─────────────────
  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    const measure = () => setContainerWidth(node.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, [doc]);

  const zoomBy = useCallback((delta: number) => {
    setZoom((z) => Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round((z + delta) * 100) / 100)));
  }, []);

  // Width a page should display at: fit the container (minus padding) × zoom.
  const targetWidth = containerWidth > 0 ? Math.max(240, (containerWidth - 32) * zoom) : 0;

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
        <AlertCircle className="h-9 w-9 opacity-50 text-red-500" />
        <p className="max-w-sm text-center text-sm text-[var(--color-text-secondary)]">
          Could not render this PDF.
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.open(externalUrl, "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open in new tab
          </Button>
          <Button variant="ghost" size="sm" onClick={onDownload}>
            <Download className="h-3.5 w-3.5" />
            Download
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-2">
      {/* Toolbar */}
      <div className="flex items-center gap-1">
        {numPages > 0 && (
          <span className="select-none text-xs font-medium tabular-nums text-[var(--color-text-secondary)]">
            {currentPage} / {numPages}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            icon={ChevronDown}
            label="Zoom out"
            onClick={() => zoomBy(-ZOOM_STEP)}
            disabled={zoom <= MIN_ZOOM}
            iconClassName="h-4 w-4"
          />
          <span className="min-w-12 select-none text-center text-xs font-medium tabular-nums text-[var(--color-text-secondary)]">
            {Math.round(zoom * 100)}%
          </span>
          <IconButton
            icon={Plus}
            label="Zoom in"
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={zoom >= MAX_ZOOM}
            iconClassName="h-4 w-4"
          />
          <IconButton
            icon={RefreshCcw}
            label="Reset zoom"
            onClick={() => setZoom(1)}
            iconClassName="h-4 w-4"
          />
          <span className="mx-1 h-5 w-px bg-[var(--color-border)]" aria-hidden />
          <IconButton
            icon={ExternalLink}
            label="Open in new tab"
            onClick={() => window.open(externalUrl, "_blank", "noopener,noreferrer")}
            iconClassName="h-4 w-4"
          />
          <IconButton
            icon={Download}
            label="Download"
            onClick={onDownload}
            iconClassName="h-4 w-4"
          />
        </div>
      </div>

      {/* Pages */}
      <div
        ref={scrollRef}
        role="document"
        aria-label={filename}
        className="min-h-0 w-full flex-1 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-1)]"
      >
        {!doc ? (
          <div className="flex h-full items-center justify-center">
            <LogoSpinner size="sm" speed="fast" />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-4">
            {Array.from({ length: numPages }, (_, i) => (
              <PdfPage
                key={i + 1}
                doc={doc}
                pageNumber={i + 1}
                targetWidth={targetWidth}
                rootRef={scrollRef}
                onActive={setCurrentPage}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* One page — lazily painted to a canvas, re-painted crisply on zoom          */
/* -------------------------------------------------------------------------- */

function PdfPage({
  doc,
  pageNumber,
  targetWidth,
  rootRef,
  onActive,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  targetWidth: number;
  rootRef: React.RefObject<HTMLDivElement | null>;
  onActive: (page: number) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<PDFPageProxy | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const [visible, setVisible] = useState(false);
  // Real display height, set once the page has been rendered (0 until then).
  const [displayHeight, setDisplayHeight] = useState(0);
  // Reserve a sensible height before the page paints (estimated from the current
  // width) so placeholders don't collapse to 0 — which would make the lazy-render
  // gate fire for every page at once and the scrollbar jump on first paint.
  const placeholderHeight =
    displayHeight || (targetWidth > 0 ? Math.round(targetWidth * FALLBACK_ASPECT) : 400);

  // Reveal when near the viewport, and report the page as "active" (for the
  // toolbar counter) when it's the most prominent one on screen.
  useEffect(() => {
    const node = wrapperRef.current;
    const root = rootRef.current;
    if (!node || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          // Track visibility in BOTH directions so a page that scrolls far out
          // of view stops re-rendering on every zoom/width change (it would
          // otherwise re-paint the whole document on a single zoom click).
          setVisible(entry.isIntersecting);
          if (entry.intersectionRatio >= 0.5) onActive(pageNumber);
        }
      },
      { root, rootMargin: "200% 0px", threshold: [0, 0.5] }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [rootRef, pageNumber, onActive]);

  // Release the page proxy's decoded resources when this page unmounts (viewer
  // close / navigate away). The document-level destroy frees these too, but
  // per-page cleanup reclaims memory sooner for long PDFs.
  useEffect(() => {
    return () => {
      try {
        renderTaskRef.current?.cancel();
        void pageRef.current?.cleanup();
      } catch {
        // best-effort
      }
      pageRef.current = null;
    };
  }, []);

  // Paint (or re-paint) the canvas whenever it becomes visible or the target
  // width (fit × zoom) changes. Cancels any in-flight render first.
  useEffect(() => {
    if (!visible || targetWidth <= 0) return;
    let cancelled = false;

    (async () => {
      try {
        const page = pageRef.current ?? (await doc.getPage(pageNumber));
        if (cancelled) return;
        pageRef.current = page;

        const base = page.getViewport({ scale: 1 });
        const scale = targetWidth / base.width;
        const viewport = page.getViewport({ scale });
        const outputScale = window.devicePixelRatio || 1;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        setDisplayHeight(Math.floor(viewport.height));

        renderTaskRef.current?.cancel();
        // canvas: null + canvasContext is the v6 backward-compat path that lets us
        // keep managing canvas dimensions ourselves (for crisp HiDPI rendering).
        const task = page.render({
          canvas: null,
          canvasContext: ctx,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        });
        renderTaskRef.current = task;
        await task.promise;
      } catch {
        // RenderingCancelledException (from .cancel()) and transient errors are
        // expected when zoom changes mid-render — the next effect run repaints.
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [doc, pageNumber, targetWidth, visible]);

  return (
    <div
      ref={wrapperRef}
      className="flex w-full items-center justify-center"
      style={{ minHeight: placeholderHeight }}
    >
      <canvas
        ref={canvasRef}
        className="max-w-full rounded-md bg-white shadow-md"
        aria-label={`Page ${pageNumber}`}
      />
    </div>
  );
}
