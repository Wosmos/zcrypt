"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { LogoSpinner } from "@/components/ui/logo-spinner";
import { AlertTriangle, Music, CheckCircle2, Download, File, Eye } from "@/lib/icons";
import { formatBytes, easeProgress } from "@/lib/utils";

/**
 * Presentational shells shared by the public token viewers (s / send / pad).
 * These are pure chrome: every page keeps its own decrypt / key-derivation /
 * password / preview-type logic inline and only borrows the exact markup that
 * was byte-for-byte identical across pages. The folder viewer (app/f) has its
 * own bespoke card/loading/error markup and intentionally does not use these.
 */

/** The card container: rounded surface with border + shadow, clipping children. */
export function ViewerCard({ children }: { children: ReactNode }) {
  return <div className="pv2-card pv2-ring corner-squircle overflow-hidden">{children}</div>;
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

export function useShortExpiry(): (expiresAt: string) => string {
  const t = useTranslations("tools");
  return (expiresAt) => {
    const diff = new Date(expiresAt).getTime() - Date.now();
    if (diff <= 0) return t("token.expired");
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) return t("token.expiryDH", { days: Math.floor(hours / 24), hours: hours % 24 });
    if (hours > 0) return t("token.expiryHM", { hours, mins });
    return t("token.expiryM", { mins });
  };
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
  const t = useTranslations("tools");
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 gap-3 text-center">
      <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-amber-500/10">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
      </div>
      <h2 className="text-lg font-semibold">{t("token.incompleteTitle")}</h2>
      <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
        {t.rich("token.incompleteBody", {
          code: (chunks) => <code className="text-[var(--color-text-secondary)]">{chunks}</code>,
        })}
      </p>
    </div>
  );
}

/** Icon + filename + size (with an optional preview-available badge) atop the
 *  credential/ready state: shared by every public token page. */
export function TokenFileHeader({
  fileName,
  fileSize,
  previewType,
}: {
  fileName: string;
  fileSize: number;
  previewType: "image" | "video" | "audio" | "none";
}) {
  const t = useTranslations("tools");
  return (
    <div className="px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-[var(--color-accent)]/10 flex-shrink-0">
          <File className="h-6 w-6 text-[var(--color-accent)]" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{fileName}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {formatBytes(fileSize)}
            {previewType !== "none" && (
              <span className="ml-1.5 text-[var(--color-accent)]">
                &middot;{" "}
                {previewType === "image"
                  ? t("token.previewImage")
                  : previewType === "video"
                    ? t("token.previewVideo")
                    : t("token.previewAudio")}
              </span>
            )}
          </p>
        </div>
      </div>
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

/** Preview pane title bar: filename + a "Save" shortcut, above the media itself. */
export function PreviewHeader({ name, onSave }: { name: string; onSave: () => void }) {
  const t = useTranslations("tools");
  return (
    <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--color-border)]">
      <div className="flex items-center gap-2 min-w-0">
        <Eye className="h-4 w-4 text-[var(--color-accent)] flex-shrink-0" />
        <p className="text-sm font-semibold truncate">{name}</p>
      </div>
      <button
        onClick={onSave}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--color-accent)]/10 text-[var(--color-accent)] hover:bg-[var(--color-accent)]/20 transition-colors flex-shrink-0"
      >
        <Download className="h-3.5 w-3.5" />
        {t("token.save")}
      </button>
    </div>
  );
}

/** "Download Complete" confirmation panel. `children` holds any extra action
 *  (e.g. a "Download Again" button) below the message. */
export function DownloadCompletePanel({
  fileName,
  children,
}: {
  fileName: string;
  children?: ReactNode;
}) {
  const t = useTranslations("tools");
  return (
    <div className="p-6">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex items-center justify-center h-12 w-12 rounded-xl bg-cyan-500/10">
          <CheckCircle2 className="h-6 w-6 text-cyan-500" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{t("token.complete")}</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            {t("token.completeBody", { name: fileName || t("token.fileFallback") })}
          </p>
        </div>
        {children}
      </div>
    </div>
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
  const t = useTranslations("tools");
  return (
    <div className="p-4">
      {previewType === "image" && previewUrl && (
        <div className="flex items-center justify-center rounded-xl overflow-hidden bg-[var(--color-surface-1)]">
          <Image src={previewUrl} alt={name} className="max-w-full max-h-[60vh] object-contain" />
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
          <p className="text-sm font-medium">{t("token.decrypted")}</p>
          <p className="text-xs text-[var(--color-text-muted)]">{t("token.noPreview")}</p>
          <Button onClick={onSave} className="mt-2">
            <Download className="h-4 w-4 mr-2" />
            {t("token.saveToDevice")}
          </Button>
        </div>
      )}
    </div>
  );
}
