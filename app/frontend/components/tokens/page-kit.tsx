import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Download, Eye } from "@/lib/icons";
import type { Shield } from "@/lib/icons";
import { formatBytes } from "@/lib/utils";
import {
  DownloadCompletePanel,
  MediaPreview,
  PreviewHeader,
  ViewerDecryptProgress,
  ViewerLoading,
} from "@/components/tokens/viewer";
import type { Progress, ViewerState } from "@/components/tokens/use-token-viewer";
import type { PreviewType } from "@/components/tokens/preview-types";

export function TokenPageShell({
  icon: Icon,
  brand,
  footer,
  children,
}: {
  icon: typeof Shield;
  brand: string;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="w-full max-w-lg animate-fade-in">
      <div className="flex items-center justify-center gap-2 mb-8">
        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-accent)]/10">
          <Icon className="h-5 w-5 text-[var(--color-accent)]" />
        </div>
        <span className="text-xl font-bold font-heading tracking-tight">{brand}</span>
      </div>

      {children}

      <p className="text-center text-[10px] text-[var(--color-text-muted)] mt-6">{footer}</p>
    </div>
  );
}

export function TokenActions({
  previewable,
  disabled,
  onPreview,
  onDownload,
  submit,
}: {
  previewable: boolean;
  disabled: boolean;
  onPreview: () => void;
  onDownload: () => void;
  submit?: boolean;
}) {
  const t = useTranslations("tools");
  const primary = submit ? ({ type: "submit" } as const) : { onClick: onPreview };
  return (
    <div className="flex gap-2">
      {previewable ? (
        <>
          <Button {...primary} disabled={disabled} className="flex-1">
            <Eye className="h-4 w-4 mr-2" />
            {t("pub.decryptPreview")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onDownload}
            disabled={disabled}
            className="flex-shrink-0"
          >
            <Download className="h-4 w-4" />
          </Button>
        </>
      ) : (
        <Button
          {...(submit ? { type: "submit" as const } : { onClick: onDownload })}
          disabled={disabled}
          className="w-full"
        >
          <Download className="h-4 w-4 mr-2" />
          {t("pub.downloadDecrypt")}
        </Button>
      )}
    </div>
  );
}

export function TokenInfoNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
      <p className="text-xs text-cyan-700 dark:text-cyan-300">{children}</p>
    </div>
  );
}

export function TokenProgressStates({
  pageState,
  loadingMessage,
  info,
  progress,
  fileName,
  previewType,
  previewUrl,
  onSave,
  previewExtras,
  doneExtras,
}: {
  pageState: ViewerState;
  loadingMessage: string;
  info: { file_name: string; file_size: number } | null;
  progress: Progress;
  fileName: string;
  previewType: PreviewType;
  previewUrl: string | null;
  onSave: () => void;
  previewExtras?: ReactNode;
  doneExtras?: ReactNode;
}) {
  return (
    <>
      {pageState === "loading" && <ViewerLoading message={loadingMessage} />}

      {pageState === "decrypting" && info && (
        <ViewerDecryptProgress
          fileName={info.file_name}
          fileSize={info.file_size}
          stage={progress.stage}
          percent={progress.percent}
        />
      )}

      {pageState === "preview" && info && (
        <TokenPreviewPanel
          name={fileName || info.file_name}
          size={info.file_size}
          previewType={previewType}
          previewUrl={previewUrl}
          onSave={onSave}
        >
          {previewExtras}
        </TokenPreviewPanel>
      )}

      {pageState === "done" && (
        <DownloadCompletePanel fileName={fileName}>{doneExtras}</DownloadCompletePanel>
      )}
    </>
  );
}

function TokenPreviewPanel({
  name,
  size,
  previewType,
  previewUrl,
  onSave,
  children,
}: {
  name: string;
  size: number;
  previewType: PreviewType;
  previewUrl: string | null;
  onSave: () => void;
  children?: ReactNode;
}) {
  const t = useTranslations("tools");
  return (
    <>
      <PreviewHeader name={name} onSave={onSave} />
      <MediaPreview previewType={previewType} previewUrl={previewUrl} name={name} onSave={onSave} />
      <div className="px-5 py-3 border-t border-[var(--color-border)] flex items-center justify-between">
        <p className="text-[10px] text-[var(--color-text-muted)]">
          {t("pub.decryptedInBrowser", { size: formatBytes(size) })}
        </p>
        {children}
      </div>
    </>
  );
}
