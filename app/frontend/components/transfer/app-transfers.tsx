"use client";

import { TransferManager } from "@/components/transfer/transfer-manager";
import { useVaultLockContext } from "@/components/providers/vault-lock-provider";

/**
 * AppTransfers — mounts the single docked <TransferManager /> and bridges its
 * `onNeedUnlock` to the shared app-wide vault unlock (REBUILD_SPEC §4/§6).
 *
 * When a Retry/Resume needs the passphrase and none is cached, the manager calls
 * `onNeedUnlock(resume)`; we open the ONE unlock modal and run `resume()` once
 * the user unlocks so the action proceeds with the now-cached passphrase. The
 * passphrase itself is never passed through here — only the resume callback.
 */
export function AppTransfers() {
  const vault = useVaultLockContext();
  return <TransferManager onNeedUnlock={(resume) => vault.unlock(() => resume())} />;
}
