"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { getSendInfo, getSendMeta, getSendChunk } from "@/lib/api";
import { Shield, Send, AlertTriangle, Clock } from "@/lib/icons";
import { openSendHash } from "@/lib/send-hash";
import { keyFromFragment } from "@/lib/share-link";
import { isSealed, keyFromBytes } from "@/lib/sealed";
import { resolveDownloadName, sniffFileType } from "@/lib/mime-sniff";
import { openLinkName } from "@/components/tokens/link-name";
import {
  ViewerCard,
  ViewerError,
  ViewerIncompleteLink,
  TokenFileHeader,
  useShortExpiry,
} from "@/components/tokens/viewer";
import {
  TokenPageShell,
  TokenActions,
  TokenInfoNote,
  TokenProgressStates,
} from "@/components/tokens/page-kit";
import { getPreviewType, getMimeType } from "@/components/tokens/preview-types";
import { downloadChunks } from "@/components/tokens/chunk-download";
import { useTokenViewer } from "@/components/tokens/use-token-viewer";
import type { Progress } from "@/components/tokens/use-token-viewer";
import type { SendInfo } from "@/types";

const noopSubscribe = () => () => {};

export default function SendDownloadPage() {
  const t = useTranslations("tools");
  const formatExpiry = useShortExpiry();
  const { token } = useParams<{ token: string }>();
  const [info, setInfo] = useState<SendInfo | null>(null);
  const encryptionKey = useSyncExternalStore(noopSubscribe, keyFromFragment, () => null);

  const decryptFile = useCallback(
    async (setProgress: (p: Progress) => void) => {
      if (!token || !encryptionKey) return null;

      const { deriveKeyBytes, decryptChunk, sha256Hex, fromBase64 } = await import("@/lib/crypto");
      const { getDeviceProfile } = await import("@/lib/device-profile");

      setProgress({ stage: t("pub.fetching"), percent: 0 });
      const meta = await getSendMeta(token);

      setProgress({ stage: t("pub.deriving"), percent: 1 });
      const salt = fromBase64(meta.salt);
      const keyBytes = await deriveKeyBytes(encryptionKey, salt);

      const decryptedChunks = await downloadChunks({
        count: meta.chunk_count,
        concurrency: getDeviceProfile().maxConcurrentDownloads,
        setProgress,
        stageLabel: (done, total) => t("pub.decryptingN", { done, total }),
        fetchChunk: async (index) => {
          const res = await getSendChunk(token, index);
          try {
            return await decryptChunk(keyBytes, new Uint8Array(res.data));
          } catch {
            throw new Error(t("pub.decryptCorrupt"));
          }
        },
      });

      setProgress({ stage: t("pub.verifying"), percent: 93 });
      const totalSize = decryptedChunks.reduce((sum, c) => sum + c.byteLength, 0);
      const fullFile = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of decryptedChunks) {
        fullFile.set(chunk, offset);
        offset += chunk.byteLength;
      }

      const actualHash = await sha256Hex(fullFile);
      const expectedHash = await openSendHash(meta.sha256, await keyFromBytes(keyBytes));
      if (actualHash !== expectedHash) {
        throw new Error(t("pub.integrityMismatch"));
      }

      const originalName = resolveDownloadName(info?.file_name ?? "", fullFile);
      const mime =
        getMimeType(originalName) || sniffFileType(fullFile)?.mime || "application/octet-stream";
      const blob = new Blob([fullFile], { type: mime });
      return { blob, originalName };
    },
    [token, encryptionKey, info, t],
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
  } = useTokenViewer({
    enabled: !!token && !!encryptionKey,
    decrypt: decryptFile,
    previewFallback: t("pub.decryptFailed"),
    downloadFallback: t("pub.downloadFailed"),
    fallbackSaveName: info?.file_name ?? "",
  });

  useEffect(() => {
    if (!token) return;
    getSendInfo(token)
      .then((data) => {
        setInfo(data);
        if (!data.valid) {
          setPageState("error");
          setErrorMsg(data.reason || t("pub.send.invalid"));
        } else {
          setPageState("ready");
        }
      })
      .catch(() => {
        setPageState("error");
        setErrorMsg(t("pub.send.notFound"));
      });
  }, [token, t, setPageState, setErrorMsg]);

  // The filename may be sealed under the link key (enc1:). Open it once both the
  // key (fragment) and the KDF salt (public, in the info response) are known.
  useEffect(() => {
    if (!info || !encryptionKey || !isSealed(info.file_name)) return;
    const sealed = info.file_name;
    const salt = info.salt;
    const apply = (name: string) =>
      setInfo((cur) => (cur && cur.file_name === sealed ? { ...cur, file_name: name } : cur));
    openLinkName(
      sealed,
      salt
        ? async () => {
            const { deriveKeyBytes, fromBase64 } = await import("@/lib/crypto");
            return keyFromBytes(await deriveKeyBytes(encryptionKey, fromBase64(salt)));
          }
        : null,
    )
      .then(apply)
      .catch(() => apply(""));
  }, [info, encryptionKey]);

  const previewType = info ? getPreviewType(info.file_name) : "none";
  const noKey = pageState === "ready" && !encryptionKey;
  const namePending = !!info && !!encryptionKey && isSealed(info.file_name);

  return (
    <TokenPageShell
      icon={Send}
      brand="zcrypt Send"
      footer={t.rich("pub.send.footer", {
        b: (chunks) => <span className="font-semibold">{chunks}</span>,
      })}
    >
      <ViewerCard>
        {pageState === "error" && <ViewerError title={t("pub.unavailable")} message={errorMsg} />}

        {pageState === "ready" && info && noKey && <ViewerIncompleteLink />}

        {pageState === "ready" && info && !noKey && (
          <>
            <TokenFileHeader
              fileName={info.file_name}
              fileSize={info.file_size}
              previewType={previewType}
            />

            <div className="p-6 space-y-4">
              <div className="flex flex-wrap gap-2 text-[10px] text-[var(--color-text-muted)]">
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
                  <Clock className="h-3 w-3" />
                  {t("shared.expiresIn", { when: formatExpiry(info.expires_at) })}
                </span>
                {info.burn_after_read && (
                  <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-500">
                    <AlertTriangle className="h-3 w-3" />
                    {t("pub.send.burns")}
                  </span>
                )}
                <span className="flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--color-surface-1)]">
                  <Shield className="h-3 w-3" />
                  {t("shared.e2e")}
                </span>
              </div>

              <TokenActions
                previewable={previewType !== "none"}
                disabled={namePending}
                onPreview={handlePreview}
                onDownload={handleDownload}
              />

              <TokenInfoNote>{t("pub.send.info")}</TokenInfoNote>
            </div>
          </>
        )}

        <TokenProgressStates
          pageState={pageState}
          loadingMessage={t("pub.loading")}
          info={info}
          progress={progress}
          fileName={fileName}
          previewType={previewType}
          previewUrl={previewUrl}
          onSave={handleSave}
        />
      </ViewerCard>
    </TokenPageShell>
  );
}
