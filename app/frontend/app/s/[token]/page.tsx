"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { getShareInfo, getShareFileMeta, getShareChunk, completeShareDownload } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shield, Lock } from "@/lib/icons";
import { tr } from "@/store/translate";
import { chooseDiskWriter } from "@/lib/disk-save";
import { confirmLinkDownload, createLinkVerifier, needsDisk } from "@/lib/link-download";
import { keyFromFragment } from "@/lib/share-link";
import { keyFromBytes } from "@/lib/sealed";
import { openLinkName } from "@/components/tokens/link-name";
import { resolveDownloadName, sniffFileType } from "@/lib/mime-sniff";
import { fromBase64 } from "@/lib/crypto";
import { ApiError } from "@/lib/http-error";
import { ViewerCard, ViewerError, TokenFileHeader } from "@/components/tokens/viewer";
import {
  TokenPageShell,
  TokenActions,
  TokenInfoNote,
  TokenProgressStates,
} from "@/components/tokens/page-kit";
import { getPreviewType, getMimeType } from "@/components/tokens/preview-types";
import { downloadChunks } from "@/components/tokens/chunk-download";
import { useTokenViewer } from "@/components/tokens/use-token-viewer";
import type { DecryptContext, Progress, ViewerSetters } from "@/components/tokens/use-token-viewer";
import type { ShareInfo } from "@/types";

function openShareName(raw: string | undefined, key: string | null): Promise<string> {
  return openLinkName(raw, key ? () => keyFromBytes(fromBase64(key)) : null);
}

export default function SharePage() {
  const t = useTranslations("tools");
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [sharePassword, setSharePassword] = useState("");
  const [retryable, setRetryable] = useState(false);
  // The decryption key comes from the URL fragment, never typed by the user.
  const [shareKey, setShareKey] = useState<string | null>(null);
  // Older links carry no name; the saved name is then guessed from the bytes.
  const [nameGuessed, setNameGuessed] = useState(false);

  const decryptFile = useCallback(
    async (setProgress: (p: Progress) => void, { signal, purpose }: DecryptContext) => {
      if (!token || !shareKey) return null;

      // The Save-As picker needs the click's activation, so it opens before any
      // other await. A preview is held in memory, so it is refused at the same size.
      const size = info?.file_size ?? 0;
      const choice =
        purpose === "download"
          ? await chooseDiskWriter(info?.file_name || "download", size)
          : ({ kind: needsDisk(size) ? "unsupported" : "memory" } as const);
      if (choice.kind === "cancelled") return null;
      if (choice.kind === "unsupported") {
        throw new Error(
          purpose === "preview"
            ? tr("viewer.tooLarge")
            : tr("toasts.tooLargeDownload", { name: info?.file_name || "" }),
        );
      }
      const disk = choice.kind === "disk" ? choice.writer : undefined;

      try {
        const { unwrapKey, decryptChunk, fromBase64 } = await import("@/lib/crypto");
        const { getZstdCodec } = await import("@/lib/zstd");
        const { getDeviceProfile } = await import("@/lib/device-profile");
        const zstd = await getZstdCodec();

        setProgress({ stage: t("pub.fetching"), percent: 0 });
        const meta = await getShareFileMeta(token, sharePassword || undefined, signal);

        // Unwrap the file's CEK using the share key from the URL fragment.
        setProgress({ stage: t("pub.share.unwrapping"), percent: 1 });
        if (!meta.wrapped_cek) {
          throw new Error(t("pub.share.missingCek"));
        }
        let keyBytes: ArrayBuffer;
        try {
          const sk = fromBase64(shareKey);
          const cek = await unwrapKey(
            sk.buffer.slice(0) as ArrayBuffer,
            fromBase64(meta.wrapped_cek),
          );
          keyBytes = cek.buffer.slice(0) as ArrayBuffer;
        } catch {
          throw new Error(t("pub.share.invalidKey"));
        }

        const verifier = await createLinkVerifier(meta, keyBytes);
        let head: Uint8Array | undefined;
        const decryptedChunks = await downloadChunks({
          count: meta.chunk_count,
          concurrency: getDeviceProfile().maxConcurrentDownloads,
          setProgress,
          stageLabel: (done, total) => t("pub.decryptingN", { done, total }),
          signal,
          sink: disk
            ? async (d) => {
                head ??= d;
                verifier.update(d);
                await disk.write(d);
              }
            : undefined,
          fetchChunk: async (index, chunkSignal) => {
            const { data, compressed } = await getShareChunk(
              token,
              index,
              sharePassword || undefined,
              meta.download_ticket,
              chunkSignal,
            );
            let plaintext: Uint8Array;
            try {
              plaintext = await decryptChunk(keyBytes, new Uint8Array(data));
            } catch {
              throw new Error(t("pub.share.decryptFailed"));
            }
            return compressed && zstd ? zstd.ZstdStream.decompress(plaintext) : plaintext;
          },
        });

        setProgress({ stage: t("pub.verifying"), percent: 93 });
        if (!disk) for (const c of decryptedChunks) verifier.update(c);
        if (!verifier.ok()) throw new Error(t("pub.integrityMismatch"));
        const sniffBytes = head ?? decryptedChunks[0] ?? new Uint8Array();

        if (meta.download_ticket) {
          const ticket = meta.download_ticket;
          await confirmLinkDownload(
            (s) => completeShareDownload(token, ticket, sharePassword || undefined, s),
            signal,
          );
        }

        const openedName = await openShareName(meta.original_name, shareKey);
        setNameGuessed(!openedName);
        const originalName = resolveDownloadName(openedName, sniffBytes);
        if (disk) {
          await disk.close();
          return { originalName };
        }
        const mime =
          getMimeType(originalName) ||
          sniffFileType(sniffBytes)?.mime ||
          "application/octet-stream";
        return { blob: new Blob(decryptedChunks as BlobPart[], { type: mime }), originalName };
      } catch (err) {
        await disk?.abort?.().catch(() => {});
        throw err;
      }
    },
    [token, shareKey, sharePassword, info, t],
  );

  // A 401/403 bounces back to the credential form for a retry; anything else is
  // an error panel that offers a retry.
  const reportDecryptError = useCallback(
    (err: unknown, fallbackMsg: string, { setPageState, setErrorMsg }: ViewerSetters) => {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        setPageState("ready");
        setErrorMsg(t("pub.share.wrongPassword"));
        setSharePassword("");
      } else {
        setPageState("error");
        setErrorMsg(err instanceof Error ? err.message : fallbackMsg);
        setRetryable(true);
      }
    },
    [t],
  );

  const {
    pageState,
    setPageState,
    errorMsg,
    setErrorMsg,
    progress,
    previewUrl,
    fileName,
    handlePreview,
    handleDownload,
    handleSave,
    closePreview,
    cancel,
  } = useTokenViewer({
    enabled: !!token && !!shareKey,
    decrypt: decryptFile,
    previewFallback: t("pub.decryptFailed"),
    downloadFallback: t("pub.downloadFailed"),
    fallbackSaveName: info?.file_name ?? "",
    onError: reportDecryptError,
  });

  useEffect(() => {
    if (!token) return;
    // The share key lives in the URL fragment; without it the file can't be
    // decrypted no matter what, so surface that immediately.
    const key = keyFromFragment();
    // oxlint-disable-next-line react/set-state-in-effect
    setShareKey(key);

    getShareInfo(token)
      .then(async (data) => ({ ...data, file_name: await openShareName(data.file_name, key) }))
      .then((data) => {
        setInfo(data);
        if (!data.valid) {
          setPageState("error");
          setErrorMsg(data.reason || t("pub.share.invalid"));
        } else if (!key) {
          setPageState("error");
          setErrorMsg(t("pub.share.missingKey"));
        } else {
          setPageState("ready");
        }
      })
      .catch(() => {
        setPageState("error");
        setErrorMsg(t("pub.share.notFound"));
      });
  }, [token, t, setPageState, setErrorMsg]);

  const previewType = getPreviewType(fileName || info?.file_name || "");
  const isPreviewable = previewType !== "none";

  return (
    <TokenPageShell
      icon={Shield}
      brand="zcrypt"
      footer={t.rich("pub.share.footer", {
        b: (chunks) => <span className="font-semibold">{chunks}</span>,
      })}
    >
      <ViewerCard>
        {pageState === "error" && (
          <>
            <ViewerError title={t("pub.share.unavailable")} message={errorMsg} />
            {retryable && (
              <div className="flex justify-center pb-6">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setRetryable(false);
                    setErrorMsg("");
                    setPageState("ready");
                  }}
                >
                  {t("common.tryAgain")}
                </Button>
              </div>
            )}
          </>
        )}

        {pageState === "ready" && info && (
          <>
            <TokenFileHeader
              fileName={info.file_name}
              fileSize={info.file_size}
              previewType={previewType}
            />

            <form
              className="p-6 space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (info.has_password && !sharePassword) return;
                void (isPreviewable ? handlePreview() : handleDownload());
              }}
            >
              {info.has_password && (
                <Input
                  label={t("pub.share.password")}
                  type="password"
                  autoComplete="off"
                  placeholder={t("pub.share.passwordPlaceholder")}
                  value={sharePassword}
                  onChange={(e) => {
                    setSharePassword(e.target.value);
                    setErrorMsg("");
                  }}
                  icon={<Lock className="h-4 w-4" />}
                />
              )}

              {errorMsg && (
                <p role="alert" className="text-xs text-red-500 font-medium">
                  {errorMsg}
                </p>
              )}

              {/* The decryption key comes from the link fragment, so no
                  passphrase is needed, only the optional share password gates
                  these. */}
              <TokenActions
                submit
                previewable={isPreviewable}
                disabled={info.has_password && !sharePassword}
                onPreview={handlePreview}
                onDownload={handleDownload}
              />

              <TokenInfoNote>{t("pub.share.info")}</TokenInfoNote>
            </form>
          </>
        )}

        <TokenProgressStates
          pageState={pageState}
          loadingMessage={t("pub.share.loading")}
          info={info}
          progress={progress}
          fileName={fileName}
          previewType={previewType}
          previewUrl={previewUrl}
          onSave={handleSave}
          onCancel={cancel}
          previewExtras={
            <button
              onClick={closePreview}
              className="text-[10px] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
            >
              {t("pub.share.closePreview")}
            </button>
          }
          doneExtras={
            <Button
              variant="secondary"
              onClick={() => {
                setPageState("ready");
              }}
              className="mt-2"
            >
              {t("pub.share.downloadAgain")}
            </Button>
          }
        />
      </ViewerCard>

      {nameGuessed && (pageState === "done" || pageState === "preview") && (
        <p className="mt-4 text-center text-xs text-[var(--color-text-muted)]">
          {t("pub.share.nameGuessed")}
        </p>
      )}
    </TokenPageShell>
  );
}
