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
export type Decrypted = { blob: Blob; originalName: string };

export type ViewerSetters = {
  setPageState: (s: ViewerState) => void;
  setErrorMsg: (s: string) => void;
};

type Options = {
  enabled: boolean;
  decrypt: (setProgress: (p: Progress) => void) => Promise<Decrypted | null>;
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

  useEffect(() => {
    return () => {
      if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
    };
  }, []);

  const runDecrypt = useCallback(
    async (onSuccess: (blob: Blob, originalName: string) => void, fallbackMsg: string) => {
      if (!enabled) return;
      setPageState("decrypting");
      setErrorMsg("");

      try {
        const result = await decrypt(setProgress);
        if (!result) return;
        onSuccess(result.blob, result.originalName);
      } catch (err) {
        if (onError) {
          onError(err, fallbackMsg, { setPageState, setErrorMsg });
        } else {
          setPageState("error");
          setErrorMsg(err instanceof Error ? err.message : fallbackMsg);
        }
      }
    },
    [enabled, decrypt, onError],
  );

  const handlePreview = useCallback(
    () =>
      runDecrypt((blob, originalName) => {
        setDecryptedBlob(blob);
        setFileName(originalName);

        if (getPreviewType(originalName) !== "none") {
          if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
          const url = URL.createObjectURL(blob);
          prevUrlRef.current = url;
          setPreviewUrl(url);
        }

        setPageState("preview");
      }, previewFallback),
    [runDecrypt, previewFallback],
  );

  const handleDownload = useCallback(
    () =>
      runDecrypt((blob, originalName) => {
        saveBlob(originalName, blob);
        setPageState("done");
        setFileName(originalName);
      }, downloadFallback),
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
  };
}
