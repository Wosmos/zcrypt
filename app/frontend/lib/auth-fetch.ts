import { useAuthStore } from "@/store/auth";
import { refreshToken as refreshTokenApi } from "@/lib/auth-api";
import { isTauri, refreshSession } from "@/lib/tauri";

// Shared across the JSON API client (lib/api.ts) and the chunked-upload path
// (lib/upload-session.ts) so refreshes are deduped. This is critical: refresh
// tokens ROTATE on use, so two independent concurrent refreshes with the same
// token would make one fail and clearAuth(): logging the user out mid-upload.
let refreshPromise: Promise<RefreshOutcome> | null = null;

/** token is the new access token, or null when the refresh failed. rejected
 *  tells a definitive "no session" (the server refused the refresh token, and
 *  auth was cleared) apart from a transient miss that leaves it alone. */
export interface RefreshOutcome {
  token: string | null;
  rejected: boolean;
}

export async function tryRefreshToken(): Promise<string | null> {
  return (await refreshSessionToken()).token;
}

export async function refreshSessionToken(): Promise<RefreshOutcome> {
  const { refreshTokenValue, setTokens, clearAuth } = useAuthStore.getState();
  // Desktop keeps the token in memory/localStorage and must have it to try.
  // Web never persists it (store/auth.ts) — refreshTokenValue is null after
  // any reload even for a logged-in user, so the web path always attempts
  // the call and relies on the httpOnly zcrypt_rt cookie instead.
  if (!refreshTokenValue && isTauri) return { token: null, rejected: true };

  if (refreshPromise) return refreshPromise;

  // Desktop: the Rust engine owns the refresh chain (uploads and sync hold the
  // same session), so rotate through it. Refreshing here as well would spend a
  // token the engine still holds and log the user out. Before the engine is
  // connected there is nothing to race, so fall back to the plain call.
  const rotate = isTauri
    ? refreshSession().catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not connected")) return refreshTokenApi(refreshTokenValue);
        if (msg.includes("unauthorized")) throw Object.assign(new Error(msg), { status: 401 });
        throw err;
      })
    : refreshTokenApi(refreshTokenValue);

  refreshPromise = rotate
    .then((data): RefreshOutcome => {
      setTokens(data.access_token, data.refresh_token);
      return { token: data.access_token, rejected: false };
    })
    .catch((err: unknown): RefreshOutcome => {
      // Only a DEFINITIVE auth failure (the refresh token itself is invalid/
      // expired → 401/403) should log the user out. A transient failure, network
      // blip, timeout, or 5xx during a long upload: must NOT clearAuth, or the
      // whole transfer dies and the user is bounced to login mid-upload (the prod
      // bug). On a transient miss we return null; the caller keeps the old token
      // and the next chunk simply retries the refresh.
      const status = (err as { status?: number })?.status;
      const rejected = status === 401 || status === 403;
      if (rejected) clearAuth();
      return { token: null, rejected };
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * fetch wrapper that attaches the current access token and, on a 401, refreshes
 * the token once and retries with the new one.
 *
 * Each call refreshes independently, so an upload that outlives the 15-minute
 * access-token lifetime keeps going (every chunk that hits a 401 transparently
 * refreshes) instead of dying with "invalid or expired token".
 *
 * No timeout is imposed: chunk uploads can legitimately take a while on a slow
 * relay. Pass `init.signal` if a caller needs cancellation. The body must be a
 * buffered type (string / ArrayBuffer / typed array) so it survives the retry;
 * all upload-session callers use those, never a one-shot ReadableStream.
 */
export async function authedFetch(input: string, init?: RequestInit): Promise<Response> {
  const { accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string>) };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401 && accessToken) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(input, { ...init, headers });
    }
  }
  return res;
}
