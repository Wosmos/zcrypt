"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useVaultLock, type UseVaultLock } from "@/hooks/useVaultLock";
import { PassphraseModal } from "@/components/ui/passphrase-modal";
import { VaultFirstTimeWarning } from "@/components/vault/vault-first-time-warning";
import { usePassphraseStore } from "@/store/passphrase";
import { useFilesQuery } from "@/store/files";
import { verifyVaultPassphrase } from "@/lib/vault-verify";

// localStorage flag: set once the user has acknowledged the first-time passphrase
// warning, so it never fires again on this device. `zcrypt-` prefix matches the
// existing convention (see store/passphrase.ts REMEMBER_KEY).
const PASSPHRASE_ACK_KEY = "zcrypt-vault-passphrase-ack";

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
  const filesQuery = useFilesQuery();
  // The passphrase the user just entered, held ONLY while the first-time warning
  // is up (null otherwise). Its presence hides the unlock modal and shows the
  // warning; it never leaves this state and is never logged or persisted here.
  const [pendingFirstTime, setPendingFirstTime] = useState<string | null>(null);

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

  // Intercept the unlock confirm: the FIRST time a passphrase is set on an empty
  // vault (the moment it's really being CREATED), route through the one-time
  // "you alone hold this key, it can't be recovered" warning before letting the
  // unlock proceed. PassphraseModal caches the passphrase and THEN calls
  // onConfirm, so by the time we get here it's already cached — confirm runs the
  // real onConfirm (closing the modal + firing any pending action such as the
  // upload that prompted the unlock); cancel re-locks to fully undo it.
  const handleConfirm = useCallback(
    (passphrase: string) => {
      const files = filesQuery.data;
      const emptyVault = Array.isArray(files) && files.length === 0;
      let acked = true;
      try {
        acked = localStorage.getItem(PASSPHRASE_ACK_KEY) === "1";
      } catch {
        acked = true; // storage unavailable — never block the unlock
      }
      // Warn ONLY when the list has loaded and is empty AND we've never warned
      // before. An unknown/loading list, or any existing files, proceeds
      // normally — so an established user is never scared by this.
      if (emptyVault && !acked) {
        setPendingFirstTime(passphrase);
        return;
      }
      vault.modalProps.onConfirm(passphrase);
    },
    [filesQuery.data, vault.modalProps]
  );

  const confirmFirstTime = useCallback(() => {
    try {
      localStorage.setItem(PASSPHRASE_ACK_KEY, "1");
    } catch {
      /* ignore — worst case the warning shows again next time */
    }
    const pp = pendingFirstTime ?? "";
    setPendingFirstTime(null);
    // The real confirm: caches (idempotent), closes the modal, runs the pending action.
    vault.modalProps.onConfirm(pp);
  }, [pendingFirstTime, vault.modalProps]);

  const cancelFirstTime = useCallback(() => {
    setPendingFirstTime(null);
    // The modal already cached the passphrase — re-lock to undo it fully (memory
    // + any device-persisted copy) and return the user to the locked vault.
    vault.lock();
  }, [vault]);

  const value = useMemo<VaultLockContextValue>(() => ({ ...vault, ready }), [vault, ready]);

  return (
    <VaultLockContext.Provider value={value}>
      {children}
      {/* The single app-wide unlock modal. Hidden (NOT closed) while the
          first-time warning is up: calling onClose would drop the pending action
          held in useVaultLock's pendingRef, so we suppress it via `open` instead. */}
      <PassphraseModal
        {...vault.modalProps}
        onConfirm={handleConfirm}
        open={vault.modalProps.open && pendingFirstTime === null}
      />
      {/* One-time first-time-set warning, gated behind a passphrase re-type + ack. */}
      <VaultFirstTimeWarning
        open={pendingFirstTime !== null}
        passphrase={pendingFirstTime ?? ""}
        onConfirm={confirmFirstTime}
        onCancel={cancelFirstTime}
      />
    </VaultLockContext.Provider>
  );
}
