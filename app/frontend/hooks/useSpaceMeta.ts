"use client";

import { useEffect, useState } from "react";
import { loadSpaceKey, openSpaceText } from "@/lib/spaces";
import { useKeysStore } from "@/store/keys";
import { tr } from "@/store/translate";
import type { SharedVault } from "@/types";

const SEALED = "s1:";

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
          name: (await openSpaceText(key, rawName)) || tr("l10n.untitledSpace"),
          description: await openSpaceText(key, rawDescription),
        };
      } catch {
        next = { stamp, name: tr("l10n.untitledSpace"), description: "" };
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
  if (!sealed)
    return { name: rawName || tr("l10n.untitledSpace"), description: rawDescription, ready: true };
  if (opened && opened.stamp === stamp) {
    return { name: opened.name, description: opened.description, ready: true };
  }
  return { name: keysReady ? "" : tr("l10n.lockedSpace"), description: "", ready: false };
}
