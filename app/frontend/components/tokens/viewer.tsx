"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { AlertTriangle, Music, CheckCircle2, Download } from "@/lib/icons";
import { formatBytes, easeProgress } from "@/lib/utils";

/**
 * Presentational shells shared by the public token viewers (s / send / pad).
 * These are pure chrome — every page keeps its own decrypt / key-derivation /
 * password / preview-type logic inline and only borrows the exact markup that
 * was byte-for-byte identical across pages. The folder viewer (app/f) has its
 * own bespoke card/loading/error markup and intentionally does not use these.
 */

/** The card container: rounded surface with border + shadow, clipping children. */
export function ViewerCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl overflow-hidden">
      {children}
    </div>
  );
}

/** Centered spinner + a caption while the link's info is loading. */
export function ViewerLoading({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <LogoSpinner size={32} />
      <p className="text-sm text-[var(--color-text-muted)]">{message}</p>
    </div>
  );
}

/** Red alert panel for an unavailable / invalid link. */
export function ViewerError({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
      <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-red-500/10">
        <AlertTriangle className="h-6 w-6 text-red-500" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-sm text-[var(--color-text-muted)] max-w-xs">{message}</p>
    </div>
  );
}

/** Amber panel shown when the URL fragment is missing its `#key=…`. */
export function ViewerIncompleteLink() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
      <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-amber-500/10">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
      </div>
      <h2 className="text-lg font-semibold">Incomplete Link</h2>
      <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
        This link is missing the encryption key. Make sure you copied the full URL including the <code className="text-[var(--color-text-secondary)]">#key=...</code> part.
      </p>
    </div>
  );
}

/** File header + eased progress bar during in-browser decryption. */
export function ViewerDecryptProgress({
  fileName,
  fileSize,
  stage,
  percent,
}: {
  fileName: string;
  fileSize: number;
  stage: string;
  percent: number;
}) {
  return (
    <>
      <div className="px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--color-accent)]/10 flex-shrink-0">
            <LogoSpinner size={24} speed="fast" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{fileName}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{formatBytes(fileSize)}</p>
          </div>
        </div>
      </div>
      <div className="p-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-[var(--color-text-muted)]">{stage}</span>
            <span className="font-medium tabular-nums">{easeProgress(percent)}%</span>
          </div>
          <div className="h-2 rounded-full bg-[var(--color-surface-1)] overflow-hidden">
            <div
              className="h-full rounded-full bg-[var(--color-accent)] transition-all duration-500 ease-in-out"
              style={{ width: `${easeProgress(percent)}%` }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

/** The decrypted-content preview body (image / video / audio / none fallback). */
export function MediaPreview({
  previewType,
  previewUrl,
  name,
  onSave,
}: {
  previewType: "image" | "video" | "audio" | "none";
  previewUrl: string | null;
  name: string;
  onSave: () => void;
}) {
  return (
    <div className="p-4">
      {previewType === "image" && previewUrl && (
        <div className="flex items-center justify-center rounded-xl overflow-hidden bg-[var(--color-surface-1)]">
          <Image
            src={previewUrl}
            alt={name}
            className="max-w-full max-h-[60vh] object-contain"
          />
        </div>
      )}

      {previewType === "video" && previewUrl && (
        <div className="flex items-center justify-center rounded-xl overflow-hidden bg-black">
          <video
            src={previewUrl}
            controls
            autoPlay={false}
            playsInline
            className="max-w-full max-h-[60vh]"
          />
        </div>
      )}

      {previewType === "audio" && previewUrl && (
        <div className="flex flex-col items-center gap-4 py-6 rounded-xl bg-[var(--color-surface-1)]">
          <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-[var(--color-accent)]/10">
            <Music className="h-8 w-8 text-[var(--color-accent)]" />
          </div>
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">{name}</p>
          <audio src={previewUrl} controls className="w-full max-w-sm" />
        </div>
      )}

      {previewType === "none" && (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckCircle2 className="h-8 w-8 text-cyan-500" />
          <p className="text-sm font-medium">File decrypted successfully</p>
          <p className="text-xs text-[var(--color-text-muted)]">No preview available for this file type.</p>
          <Button onClick={onSave} className="mt-2">
            <Download className="h-4 w-4 mr-2" />
            Save to Device
          </Button>
        </div>
      )}
    </div>
  );
}
