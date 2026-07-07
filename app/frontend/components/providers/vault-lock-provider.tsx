"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useVaultLock, type UseVaultLock } from "@/hooks/useVaultLock";
import { PassphraseModal } from "@/components/ui/passphrase-modal";
import { usePassphraseStore } from "@/store/passphrase";
import { verifyVaultPassphrase } from "@/lib/vault-verify";

/**
 * The context value is the vault-lock API plus `ready`: true once the
 * device-persisted-passphrase rehydrate attempt has settled. Consumers gate the
 * lock overlay on it so a remembered-device session doesn't flash the lock
 * screen for one frame on every reload before rehydrate resolves.
 */
export type VaultLockContextValue = UseVaultLock & { ready: boolean };

/**
 * VaultLockProvider — owns the ONE vault-unlock instance for the whole
 * authenticated app (REBUILD_SPEC §3: "one hook, one modal, one pill").
 *
 * Mounted in `app/(app)/layout.tsx` so that BOTH the Vault page (header pill +
 * decrypt actions) and the docked <TransferManager /> (resume/retry that needs
 * the passphrase) talk to the SAME lock and trigger the SAME single
 * <PassphraseModal />. Without a shared instance, each `useVaultLock()` call
 * would mint its own modal state — this guarantees exactly one modal app-wide.
 *
 * Zero-knowledge: this provider only renders the unlock modal and re-exposes the
 * hook's API. The passphrase never leaves the client and is never logged here.
 */
const VaultLockContext = createContext<VaultLockContextValue | null>(null);

export function useVaultLockContext(): VaultLockContextValue {
  const ctx = useContext(VaultLockContext);
  if (!ctx) {
    throw new Error("useVaultLockContext must be used within a <VaultLockProvider>");
  }
  return ctx;
}

export function VaultLockProvider({ children }: { children: React.ReactNode }) {
  const vault = useVaultLock({ verify: verifyVaultPassphrase });
  const [ready, setReady] = useState(false);

  // Restore a device-persisted passphrase ("keep me unlocked on this device")
  // once on load, so the vault is already unlocked — no re-prompt, and encrypted
  // folder names render immediately instead of "[locked]". `ready` flips true
  // once that attempt settles so the lock overlay can trust `unlocked`.
  useEffect(() => {
    let cancelled = false;
    void usePassphraseStore
      .getState()
      .rehydrate()
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<VaultLockContextValue>(() => ({ ...vault, ready }), [vault, ready]);

  return (
    <VaultLockContext.Provider value={value}>
      {children}
      {/* The single app-wide unlock modal. */}
      <PassphraseModal {...vault.modalProps} />
    </VaultLockContext.Provider>
  );
}
