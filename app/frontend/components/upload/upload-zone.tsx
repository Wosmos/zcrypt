"use client";

import { useCallback, useState, DragEvent } from "react";
import { Upload, Cloud } from "@/lib/icons";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onFiles: (files: File[]) => void;
  hint?: string;
  compact?: boolean;
}

export function UploadZone({ onFiles, hint, compact }: UploadZoneProps) {
  const [dragOver, setDragOver] = useState(false);

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
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.onchange = () => {
      if (input.files) onFiles(Array.from(input.files));
    };
    input.click();
  }, [onFiles]);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload files — drop files here or click to browse"
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
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl transition-all duration-200",
          compact ? "h-11 w-11" : "h-14 w-14",
          dragOver
            ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)] ring-1 ring-[var(--color-accent)]/20"
            : "bg-[var(--color-surface-1)] text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]"
        )}
      >
        {dragOver ? (
          <Cloud className={compact ? "h-5 w-5" : "h-7 w-7"} />
        ) : (
          <Upload className={compact ? "h-5 w-5" : "h-7 w-7"} />
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
          {dragOver ? "Drop to upload" : "Drop files here or click to browse"}
        </p>
        <p className="text-xs text-[var(--color-text-muted)] mt-1.5 max-w-xs mx-auto leading-relaxed">
          {hint || "Files are compressed, encrypted, and chunked before upload"}
        </p>
      </div>
    </div>
  );
}
