import { useCallback, useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

/** Copies `value` to the clipboard and flips `copied` true for 2s — the
 *  "Copied!" button feedback shared by the share-link tools. */
export function useCopyFeedback(value: string) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!value) return;
    await copyToClipboard(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [value]);

  const reset = useCallback(() => setCopied(false), []);

  return { copied, handleCopy, reset };
}
