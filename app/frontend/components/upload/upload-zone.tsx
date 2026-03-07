"use client";

import { useCallback, useState, DragEvent } from "react";
import { Upload, Cloud } from "lucide-react";
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
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onClick={handleClick}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200",
        compact ? "p-6" : "p-10 sm:p-14",
        dragOver
          ? "border-indigo-500/60 bg-indigo-500/5 shadow-xl shadow-indigo-500/10"
          : "border-zinc-800/60 hover:border-zinc-600 bg-zinc-900/20 hover:bg-zinc-900/40"
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-2xl transition-all duration-200",
          compact ? "h-11 w-11" : "h-14 w-14",
          dragOver
            ? "bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20"
            : "bg-zinc-800/50 text-zinc-500 group-hover:text-zinc-400 group-hover:bg-zinc-800/70"
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
            dragOver ? "text-indigo-300" : "text-zinc-300"
          )}
        >
          {dragOver ? "Drop to upload" : "Drop files here or click to browse"}
        </p>
        <p className="text-[11px] text-zinc-600 mt-1.5 max-w-xs mx-auto leading-relaxed">
          {hint || "Files are compressed, encrypted, and chunked before upload"}
        </p>
      </div>
    </div>
  );
}
