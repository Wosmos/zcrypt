"use client";

import { useCallback } from "react";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";
import { ensureUserKeypair } from "@/lib/keys";
import { useKeysStore } from "@/store/keys";
import { usePassphraseStore } from "@/store/passphrase";
import { toast } from "@/store/toast";

export function spaceKeysReady(): boolean {
  return Boolean(
    usePassphraseStore.getState().getPassphrase() && useKeysStore.getState().privateKey,
  );
}

/**
 * Runs a Spaces action once the vault is unlocked and this account's sharing
 * keys are loaded. When the vault is locked it opens the shared unlock prompt
 * and runs the action after the user unlocks; if they dismiss the prompt the
 * action simply never runs, so callers set any busy state inside the action.
 */
export function useVaultReady(): (action: () => Promise<void>) => void {
  const vault = useVaultLockContext();
  return useCallback(
    (action: () => Promise<void>) => {
      vault.withPassphrase((passphrase) => {
        const keys = useKeysStore.getState().privateKey
          ? Promise.resolve()
          : ensureUserKeypair(passphrase);
        keys.then(action).catch((err: unknown) => {
          toast.error(err instanceof Error ? err.message : "Couldn't unlock your sharing keys");
        });
      });
    },
    [vault],
  );
}
