"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { getSharedVault } from "@/lib/api";
import { decryptSpaceFileName, spacePerms } from "@/lib/spaces";
import { queryClient } from "@/lib/query-client";
import { qk } from "@/lib/query-keys";
import { useAuthStore } from "@/store/auth";
import { useFilesQuery } from "@/store/files";
import type { SharedVaultDetail } from "@/types";

export interface SpaceFileRow {
  id: string;
  name: string;
  size?: number;
  addedAt: string;
  wrappedCek: string;
}

export function useSpaceDetail(id: string) {
  const user = useAuthStore((s) => s.user);
  const query = useQuery({ queryKey: qk.space(id), queryFn: () => getSharedVault(id) });
  const detail: SharedVaultDetail | null = query.data ?? null;
  const perms = detail ? spacePerms(detail, user?.id) : null;
  return { query, detail, perms, userId: user?.id };
}

export function patchSpace(id: string, fn: (d: SharedVaultDetail) => SharedVaultDetail) {
  queryClient.setQueryData<SharedVaultDetail>(qk.space(id), (d) => (d ? fn(d) : d));
}

export function refreshSpace(id: string) {
  return queryClient.invalidateQueries({ queryKey: qk.space(id) });
}

export function refreshSpaces() {
  return queryClient.invalidateQueries({ queryKey: qk.spaces });
}

/** Rows for a space's files, with names opened from the space key (falling back
 *  to the owner-side name, then a generic label). */
export function useSpaceFileRows(detail: SharedVaultDetail | null): SpaceFileRow[] {
  const t = useTranslations("spaces");
  const { data: myFiles = [] } = useFilesQuery();
  const [opened, setOpened] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!detail) return;
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        (detail.files ?? []).map(
          async (f) =>
            [f.file_id, (await decryptSpaceFileName(detail, f.wrapped_name)) ?? ""] as const,
        ),
      );
      if (!cancelled) setOpened(Object.fromEntries(entries.filter(([, n]) => n)));
    })();
    return () => {
      cancelled = true;
    };
  }, [detail]);

  return useMemo(() => {
    const mine = new Map(myFiles.map((f) => [f.id, f.original_name]));
    return (detail?.files ?? []).map((f) => ({
      id: f.file_id,
      name: opened[f.file_id] || f.name || mine.get(f.file_id) || t("shared.encryptedFile"),
      size: f.size,
      addedAt: f.added_at,
      wrappedCek: f.wrapped_cek,
    }));
  }, [detail, opened, myFiles, t]);
}
