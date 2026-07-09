import { useEffect, useState } from "react";

/**
 * Runs `decode` on `blob` inside a cancellation-guarded effect — the pattern
 * shared by every file viewer that turns a decrypted blob into renderable
 * content (CSV rows, syntax-highlighted text, sanitized HTML, ...). Resets to
 * loading whenever `decode` changes identity, so callers must memoize it
 * (`useCallback`) with their own real dependencies (filename, truncation, …).
 * `errorMessage` is shown on any decode failure — the thrown error itself is
 * not surfaced, since it may leak details about the file's content.
 */
export function useDecodedBlob<T>(
  blob: Blob,
  decode: (blob: Blob) => Promise<T>,
  errorMessage: string
) {
  const [value, setValue] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setValue(null);
    setError(null);
    (async () => {
      try {
        const result = await decode(blob);
        if (!cancelled) setValue(result);
      } catch {
        if (!cancelled) setError(errorMessage);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob, decode, errorMessage]);

  return { value, error };
}
