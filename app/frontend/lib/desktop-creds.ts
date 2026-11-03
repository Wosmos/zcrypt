import { isTauri, keychainGet, keychainSet, keychainDelete } from "@/lib/tauri";
import { Platform, parseTelegramToken } from "@/lib/platforms";
import { getPlatformCredentials } from "@/lib/api";
import { ensurePlatformStatus } from "@/store/platform";

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
    const parsed = platform === Platform.Telegram ? parseTelegramToken(rawToken) : null;
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

let pickedUpFor: string | null = null;

/**
 * Desktop-only, once per signed-in user per app session: copy into the keychain
 * every own (non-global) platform token the user connected elsewhere, such as
 * on the web, that this device does not hold yet. With the token in the
 * keychain the core uploads byos-direct instead of through the relay. Tokens
 * already in the keychain are never overwritten. Best-effort and silent.
 */
export async function pickUpDesktopPlatformCreds(userId: string): Promise<void> {
  if (!isTauri || !userId || pickedUpFor === userId) return;
  pickedUpFor = userId;
  const statuses = await ensurePlatformStatus();
  for (const platform of Object.values(Platform)) {
    const own = statuses.some((s) => s.platform === platform && s.connected && !s.is_global);
    if (!own) continue;
    try {
      if (await keychainGet(`platform.${platform}.token`)) continue;
      const creds = await getPlatformCredentials(platform);
      await storeDesktopPlatformCreds(platform, creds.token, creds.account);
    } catch (err) {
      console.error(`Failed to pick up ${platform} credentials for the desktop keychain`, err);
    }
  }
}
