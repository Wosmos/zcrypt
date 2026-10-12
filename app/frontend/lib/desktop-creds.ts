import { isTauri, keychainSet, keychainDelete } from "@/lib/tauri";
import { parseTelegramToken } from "@/lib/platforms";

/**
 * Desktop-only: mirror a freshly connected platform token into the OS keychain
 * so the Tauri core can route uploads byos-direct. Never runs outside Tauri:
 * raw platform tokens must never be persisted in the browser. Best-effort.
 */
export async function storeDesktopPlatformCreds(
  platform: string,
  rawToken: string,
  username?: string,
): Promise<void> {
  if (!isTauri) return;
  try {
    const parsed = platform === "telegram" ? parseTelegramToken(rawToken) : null;
    const keychainToken = parsed?.token ?? rawToken;
    const keychainAccount = parsed?.account ?? username;
    await keychainSet(`platform.${platform}.token`, keychainToken);
    if (keychainAccount) await keychainSet(`platform.${platform}.account`, keychainAccount);
  } catch (err) {
    console.error(`Failed to store ${platform} credentials in the desktop keychain`, err);
  }
}

/** Desktop-only: forget a platform's keychain creds on disconnect. Best-effort. */
export async function clearDesktopPlatformCreds(platform: string): Promise<void> {
  if (!isTauri) return;
  try {
    await keychainDelete(`platform.${platform}.token`);
    await keychainDelete(`platform.${platform}.account`);
  } catch (err) {
    console.error(`Failed to clear ${platform} credentials from the desktop keychain`, err);
  }
}
