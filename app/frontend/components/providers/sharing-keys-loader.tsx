"use client";

import { useEffect } from "react";
import { ensureUserKeypair, OwnKeyMismatchError } from "@/lib/keys";
import { usePassphraseStore } from "@/store/passphrase";
import { toast } from "@/store/toast";

/** Loads this account's sharing keys whenever the vault is unlocked, on any
 *  page, so Spaces can open their sealed names and keys after a reload. */
export function SharingKeysLoader() {
  const passphrase = usePassphraseStore((s) => s.cachedPassphrase);
  useEffect(() => {
    if (!passphrase) return;
    ensureUserKeypair(passphrase).catch((err: unknown) => {
      if (err instanceof OwnKeyMismatchError) {
        toast.error(
          "Your sharing key on the server doesn't match this device. Sharing is paused for your safety; contact support.",
        );
      }
    });
  }, [passphrase]);
  return null;
}
