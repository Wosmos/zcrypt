import { useEffect, useRef } from "react";
import { androidBridge, SHARED_FILES_EVENT, takeSharedFiles } from "@/lib/android";

/**
 * Feed files shared to zcrypt from other Android apps into `onFiles` once
 * `ready`. Collects whatever arrived before mount, then every later share.
 */
export function useAndroidShare(onFiles: (paths: string[]) => void, ready: boolean): void {
  const onFilesRef = useRef(onFiles);
  useEffect(() => {
    onFilesRef.current = onFiles;
  }, [onFiles]);

  useEffect(() => {
    if (!ready || !androidBridge()) return;
    const drain = () => {
      const paths = takeSharedFiles();
      if (paths.length > 0) onFilesRef.current(paths);
    };
    drain();
    window.addEventListener(SHARED_FILES_EVENT, drain);
    return () => window.removeEventListener(SHARED_FILES_EVENT, drain);
  }, [ready]);
}
