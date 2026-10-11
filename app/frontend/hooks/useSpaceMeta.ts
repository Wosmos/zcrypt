"use client";

import { useEffect, useState } from "react";
import { loadSpaceKey, openSpaceText } from "@/lib/spaces";
import { useKeysStore } from "@/store/keys";
import type { SharedVault } from "@/types";

const SEALED = "s1:";
const FALLBACK = "Untitled space";
const LOCKED = "Locked space";

interface Opened {
  stamp: string;
  name: string;
  description: string;
}

/** A space's readable name and description. Sealed values ("s1:") are opened
 *  with the space key; legacy plaintext values are returned immediately. */
export function useSpaceMeta(vault: SharedVault | undefined): {
  name: string;
  description: string;
  ready: boolean;
} {
  const keysReady = useKeysStore((s) => s.ready);
  const [opened, setOpened] = useState<Opened | null>(null);

  const rawName = vault?.name ?? "";
  const rawDescription = vault?.description ?? "";
  const sealed = rawName.startsWith(SEALED) || rawDescription.startsWith(SEALED);
  const stamp = vault ? `${vault.id}|${rawName}|${rawDescription}` : "";

  useEffect(() => {
    if (!vault || !sealed || !keysReady) return;
    let cancelled = false;
    void (async () => {
      let next: Opened;
      try {
        const key = await loadSpaceKey(vault);
        if (!key) throw new Error("no key");
        next = {
          stamp,
          name: (await openSpaceText(key, rawName)) || FALLBACK,
          description: await openSpaceText(key, rawDescription),
        };
      } catch {
        next = { stamp, name: FALLBACK, description: "" };
      }
      if (!cancelled) setOpened(next);
    })();
    return () => {
      cancelled = true;
    };
    // `vault` is represented by its stamp plus the grant that opens it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, sealed, keysReady, vault?.wrapped_space_key]);

  if (!vault) return { name: "", description: "", ready: false };
  if (!sealed) return { name: rawName || FALLBACK, description: rawDescription, ready: true };
  if (opened && opened.stamp === stamp) {
    return { name: opened.name, description: opened.description, ready: true };
  }
  return { name: keysReady ? "" : LOCKED, description: "", ready: false };
}
