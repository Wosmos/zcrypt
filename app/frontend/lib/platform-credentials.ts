/** A user's own connected platform token, as GET /api/platforms/credentials returns it. */
export interface PlatformCredentials {
  platform: string;
  /** The token exactly as connected; Telegram's is "BOT_TOKEN|CHAT_ID". */
  token: string;
  /** The account name the server records chunks under (Telegram: the bot's username). */
  account: string;
}

const cache = new Map<string, PlatformCredentials>();
let generation = 0;

/** The credentials fetched earlier in this page session, if any. Memory only, never persisted. */
export function cachedPlatformCredentials(platform: string): PlatformCredentials | undefined {
  return cache.get(platform);
}

/** A stamp to pass back to rememberPlatformCredentials, so a fetch that outlives a sign-out is dropped. */
export function credentialsGeneration(): number {
  return generation;
}

/** Keep credentials in memory for this page session, unless the user signed out since `stamp`. */
export function rememberPlatformCredentials(creds: PlatformCredentials, stamp: number): void {
  if (stamp === generation) cache.set(creds.platform, creds);
}

/** Drop every cached credential. Called on sign-out. */
export function forgetPlatformCredentials(): void {
  cache.clear();
  generation++;
}
