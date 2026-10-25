"use client";

import { useEffect, useRef, useState } from "react";
import { useFolders } from "@/hooks/useFolders";
import { OPEN_FOLDER_EVENT } from "@/lib/service-worker";
import { useFolderStore } from "@/store/folders";
import { useTransferDockStore } from "@/store/transfer-dock";

const PARAM = "open";

interface Request {
  folderId: string;
}

function initialRequest(): Request | null {
  if (typeof window === "undefined") return null;
  const folderId = new URLSearchParams(window.location.search).get(PARAM);
  return folderId ? { folderId } : null;
}

function dropParam() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has(PARAM)) return;
  url.searchParams.delete(PARAM);
  window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
}

/**
 * Opens the folder a notification pointed at: from `?open=<folderId>` on load,
 * or from the service worker relaying a View tap while the app is open. The
 * name comes from the upload's remembered destination or the visible folder
 * list; `open` decides whether a password is needed first.
 */
export function useOpenFolderRequests(open: (folderId: string, name: string) => void): void {
  const { folders } = useFolders();
  const [request, setRequest] = useState<Request | null>(initialRequest);
  const served = useRef<Request | null>(null);

  useEffect(() => {
    const onRequest = (e: Event) => {
      const folderId = (e as CustomEvent<{ folderId: string | null }>).detail?.folderId ?? null;
      if (folderId) setRequest({ folderId });
      else useFolderStore.getState().setCurrentFolder(null, "");
    };
    window.addEventListener(OPEN_FOLDER_EVENT, onRequest);
    return () => window.removeEventListener(OPEN_FOLDER_EVENT, onRequest);
  }, []);

  useEffect(() => {
    if (!request || served.current === request) return;
    const { folderId } = request;
    const name =
      useTransferDockStore.getState().folderNames[folderId] ??
      folders.find((f) => f.id === folderId)?.name;
    if (name === undefined) return;
    served.current = request;
    dropParam();
    open(folderId, name);
  }, [request, folders, open]);
}
