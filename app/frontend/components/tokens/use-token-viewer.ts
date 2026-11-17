import { useCallback, useEffect, useRef, useState } from "react";
import { saveBlob } from "@/lib/utils";
import { getPreviewType } from "./preview-types";

export type ViewerState =
  | "loading"
  | "ready"
  | "decrypting"
  | "preview"
  | "downloading"
  | "done"
  | "error";

export type Progress = { stage: string; percent: number };
/** `blob` is absent when the bytes were already streamed to a file on disk. */
export type Decrypted = { blob?: Blob; originalName: string };

export type DecryptContext = { signal: AbortSignal; purpose: "preview" | "download" };

export type ViewerSetters = {
  setPageState: (s: ViewerState) => void;
  setErrorMsg: (s: string) => void;
};

type Options = {
  enabled: boolean;
  decrypt: (setProgress: (p: Progress) => void, ctx: DecryptContext) => Promise<Decrypted | null>;
  previewFallback: string;
  downloadFallback: string;
  fallbackSaveName: string;
  onError?: (err: unknown, fallbackMsg: string, ctx: ViewerSetters) => void;
};

export function useTokenViewer({
  enabled,
  decrypt,
  previewFallback,
  downloadFallback,
  fallbackSaveName,
  onError,
}: Options) {
  const [pageState, setPageState] = useState<ViewerState>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [progress, setProgress] = useState<Progress>({ stage: "", percent: 0 });
  const [decryptedBlob, setDecryptedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const prevUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const runDecrypt = useCallback(
    async (
      purpose: DecryptContext["purpose"],
      onSuccess: (result: Decrypted) => void,
      fallbackMsg: string,
    ) => {
      if (!enabled) return;
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setPageState("decrypting");
      setErrorMsg("");

      try {
        const result = await decrypt(setProgress, { signal: ctl.signal, purpose });
        if (ctl.signal.aborted) return;
        if (!result) {
          setPageState("ready");
          return;
        }
        onSuccess(result);
      } catch (err) {
        if (ctl.signal.aborted) return;
        if (onError) {
          onError(err, fallbackMsg, { setPageState, setErrorMsg });
        } else {
          setPageState("error");
          setErrorMsg(err instanceof Error ? err.message : fallbackMsg);
        }
      } finally {
        if (abortRef.current === ctl) abortRef.current = null;
      }
    },
    [enabled, decrypt, onError],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPageState("ready");
  }, []);

  const handlePreview = useCallback(
    () =>
      runDecrypt(
        "preview",
        ({ blob, originalName }) => {
          if (!blob) return;
          setDecryptedBlob(blob);
          setFileName(originalName);

          if (getPreviewType(originalName) !== "none") {
            if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
            const url = URL.createObjectURL(blob);
            prevUrlRef.current = url;
            setPreviewUrl(url);
          }

          setPageState("preview");
        },
        previewFallback,
      ),
    [runDecrypt, previewFallback],
  );

  const handleDownload = useCallback(
    () =>
      runDecrypt(
        "download",
        ({ blob, originalName }) => {
          if (blob) saveBlob(originalName, blob);
          setPageState("done");
          setFileName(originalName);
        },
        downloadFallback,
      ),
    [runDecrypt, downloadFallback],
  );

  const handleSave = useCallback(() => {
    if (!decryptedBlob) return;
    saveBlob(fileName || fallbackSaveName || "download", decryptedBlob);
  }, [decryptedBlob, fileName, fallbackSaveName]);

  const closePreview = useCallback(() => {
    if (prevUrlRef.current) {
      URL.revokeObjectURL(prevUrlRef.current);
      prevUrlRef.current = null;
    }
    setPreviewUrl(null);
    setDecryptedBlob(null);
    setPageState("ready");
  }, []);

  return {
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
  };
}
