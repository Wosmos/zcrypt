"use client";

import { useCallback, useEffect, useRef, useState, DragEvent } from "react";
import { FileUpload, Cloud, Loader2 } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { isTauri, pickFiles, toDesktopFile } from "@/lib/tauri";

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  hint?: string;
  compact?: boolean;
}

export function UploadZone({ onFiles, hint, compact }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  // "Preparing" covers the window between opening the native picker and the
  // input's change event. On iOS that window can be LONG: the OS transcodes
  // HEIC/HEVC ("preparing" the files) BEFORE change fires, with no feedback —
  // users re-tapped, spawning new pickers and orphaning their selection. While
  // preparing we show a spinner and ignore further clicks.
  const [preparing, setPreparing] = useState(false);
  // Synchronous mirror of `preparing` — React state updates are async, so a
  // rapid double-tap could slip past a state-only guard and open two pickers.
  const preparingRef = useRef(false);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The file input is a PERSISTENT hidden element in the JSX (same pattern as
  // components/vault/upload-fab.tsx). The previous implementation created a
  // detached input via document.createElement that was never appended to the
  // DOM — WebKit could garbage-collect it while the picker was open, so
  // onchange never fired and selecting 10-50 photos did nothing.
  const inputRef = useRef<HTMLInputElement>(null);

  const clearPreparing = useCallback(() => {
    preparingRef.current = false;
    setPreparing(false);
    if (focusTimerRef.current) {
      clearTimeout(focusTimerRef.current);
      focusTimerRef.current = null;
    }
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) onFiles(files);
    },
    [onFiles]
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    if (preparingRef.current) return; // picker already open / files preparing
    // Set BEFORE opening the picker so the guard is up the instant the (modal,
    // possibly slow-to-appear) native UI takes over.
    preparingRef.current = true;
    setPreparing(true);

    // Desktop: go straight to Tauri's native dialog and skip the hidden
    // <input> below entirely. The webview's OWN file input would otherwise
    // open its own native "Open" dialog first; only once that resolved did
    // the desktop upload path (useVaultActions -> store/upload.ts) realize it
    // needed real filesystem paths and open a SECOND, separate native dialog
    // to get them. Two native dialogs stacking back-to-back on one click look
    // identical, so the second one — the one that actually mattered — got
    // missed on the first attempt (toast fires, nothing ever attaches); only
    // a retry, landing on a since-settled dialog stack, worked. Picking here
    // once and threading the real paths through `onFiles` (as DesktopFiles)
    // means exactly one dialog opens per click.
    if (isTauri) {
      pickFiles({ multiple: true, title: "Select files to upload" })
        .then((paths) => {
          if (paths.length > 0) onFiles(paths.map(toDesktopFile));
        })
        .finally(clearPreparing);
      return;
    }

    inputRef.current?.click();
  }, [onFiles, clearPreparing]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      clearPreparing();
      const files = e.target.files;
      if (files && files.length > 0) onFiles(Array.from(files));
      // Reset so re-selecting the SAME files fires change again.
      e.target.value = "";
    },
    [onFiles, clearPreparing]
  );

  // Picker dismissed without a selection: modern browsers (iOS 16.4+) fire a
  // "cancel" event on the input. React has no onCancel prop for inputs, so we
  // attach it natively.
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onCancel = () => clearPreparing();
    input.addEventListener("cancel", onCancel);
    return () => input.removeEventListener("cancel", onCancel);
  }, [clearPreparing]);

  // Fallback for older iOS with no "cancel" event: when the window regains
  // focus (picker closed) and no change event arrives within 3s, assume the
  // picker was dismissed and clear the preparing state. A slow HEIC/HEVC
  // transcode can outlive the 3s — worst case the spinner clears early and the
  // zone becomes clickable again, which is safe.
  useEffect(() => {
    const onFocus = () => {
      if (!preparingRef.current) return;
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
      focusTimerRef.current = setTimeout(() => {
        if (preparingRef.current) clearPreparing();
      }, 3000);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    };
  }, [clearPreparing]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload files — drop files here or click to browse"
      aria-busy={preparing}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200",
        compact ? "p-6" : "p-10 sm:p-14",
        dragOver
          ? "border-[var(--color-accent)]/60 bg-[var(--color-accent)]/5 shadow-xl shadow-[var(--color-accent)]/10"
          : "border-[var(--color-border)] hover:border-[var(--color-border-hover)] bg-[var(--color-surface)]/50 hover:bg-[var(--color-surface-1)]/60"
      )}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={handleChange}
        className="hidden"
      />

      <div
        className={cn(
          "flex items-center justify-center rounded-2xl transition-all duration-200",
          compact ? "h-11 w-11" : "h-14 w-14",
          dragOver
            ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20"
            : "bg-[var(--color-surface-1)] text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]"
        )}
      >
        {preparing ? (
          <Loader2 className={cn("animate-spin", compact ? "h-5 w-5" : "h-7 w-7")} />
        ) : dragOver ? (
          <Cloud className={compact ? "h-5 w-5" : "h-7 w-7"} />
        ) : (
          <FileUpload className={compact ? "h-5 w-5" : "h-7 w-7"} />
        )}
      </div>

      <div className="text-center">
        <p
          className={cn(
            "font-medium transition-colors",
            compact ? "text-sm" : "text-sm sm:text-base",
            dragOver ? "text-[var(--color-accent)]" : ""
          )}
        >
          {preparing
            ? "Preparing your files…"
            : dragOver
              ? "Drop to upload"
              : "Drop files here or click to browse"}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1.5 max-w-xs mx-auto leading-relaxed">
          {preparing
            ? "Large videos can take a minute — keep this page open"
            : hint || "Files are compressed, encrypted, and chunked before upload"}
        </p>
      </div>
    </div>
  );
}
