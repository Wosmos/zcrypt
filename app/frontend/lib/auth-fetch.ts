import { useAuthStore } from "@/store/auth";
import { refreshToken as refreshTokenApi } from "@/lib/auth-api";

// Shared across the JSON API client (lib/api.ts) and the chunked-upload path
// (lib/upload-session.ts) so refreshes are deduped. This is critical: refresh
// tokens ROTATE on use, so two independent concurrent refreshes with the same
// token would make one fail and clearAuth() — logging the user out mid-upload.
let refreshPromise: Promise<string | null> | null = null;

export async function tryRefreshToken(): Promise<string | null> {
  const { refreshTokenValue, setTokens, clearAuth } = useAuthStore.getState();
  if (!refreshTokenValue) return null;

  if (refreshPromise) return refreshPromise;

  refreshPromise = refreshTokenApi(refreshTokenValue)
    .then((data) => {
      setTokens(data.access_token, data.refresh_token);
      return data.access_token;
    })
    .catch(() => {
      clearAuth();
      return null;
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
 * No timeout is imposed — chunk uploads can legitimately take a while on a slow
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
