"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listFolders } from "@/lib/api";
import { decryptNameSafe } from "@/lib/name-crypto";
import { nameKeyFor } from "@/lib/sealed";
import { usePassphraseStore } from "@/store/passphrase";
import { useAuthStore } from "@/store/auth";
import { qk } from "@/lib/query-keys";
import type { FileMetadata } from "@/types";

/** Root-level folders that currently contain files, with decrypted names + a
 *  live file count: the pickable "share a whole folder" options. */
export function useFolderOptions(files: FileMetadata[], enabled: boolean) {
  const user = useAuthStore((s) => s.user);
  const cachedPassphrase = usePassphraseStore((s) => s.cachedPassphrase);

  const rawQuery = useQuery({
    queryKey: qk.folders(null),
    queryFn: () => listFolders(null),
    enabled,
  });

  const [names, setNames] = useState<Record<string, string>>({});
  const raw = rawQuery.data;
  useEffect(() => {
    let cancelled = false;
    const pass = usePassphraseStore.getState().getPassphrase();
    if (!raw || !user || !pass) {
      setNames({});
      return;
    }
    void (async () => {
      const key = await nameKeyFor(pass, user.id);
      if (cancelled) return;
      const entries = await Promise.all(
        raw.map(async (f) => [f.id, await decryptNameSafe(f.encrypted_name, key)] as const),
      );
      if (!cancelled) setNames(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [raw, user, cachedPassphrase]);

  return useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of files) {
      if (f.folder_id) counts.set(f.folder_id, (counts.get(f.folder_id) ?? 0) + 1);
    }
    return (raw ?? [])
      .filter((f) => (counts.get(f.id) ?? 0) > 0)
      .map((f) => ({ id: f.id, name: names[f.id] ?? "Folder", count: counts.get(f.id) ?? 0 }));
  }, [raw, names, files]);
}
