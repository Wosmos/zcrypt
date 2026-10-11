import { LATEST_RELEASED_VERSION, findRelease } from "@/lib/changelog";

const key = (userId: string) => `zcrypt-whats-new:${userId}`;

export function readSeenVersion(userId: string): string | null {
  try {
    return localStorage.getItem(key(userId));
  } catch {
    return null;
  }
}

export function markVersionSeen(userId: string, version: string): void {
  try {
    localStorage.setItem(key(userId), version);
  } catch {
    /* storage unavailable */
  }
}

/** The version whose notes we show: the desktop app's own version when it has
 *  a released entry, otherwise the latest released version. */
export function resolveWhatsNewVersion(appVersion: string | null): string {
  const own = appVersion ? findRelease(appVersion) : undefined;
  return own && own.date !== null ? own.version : LATEST_RELEASED_VERSION;
}

export type WhatsNewDecision = "first-visit" | "show" | "seen";

/** First-ever visit only records the version so new accounts are not greeted
 *  with release notes for things they never had. */
export function decideWhatsNew(seen: string | null, version: string): WhatsNewDecision {
  if (seen === null) return "first-visit";
  return seen === version ? "seen" : "show";
}
