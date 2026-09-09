import type { AuthUser, AuditEvent } from "@/types";
import { isTauri } from "@/lib/tauri";

// AuditEvent now lives in types/ (so admin types can reference it without a
// types→lib inversion) — re-exported here so its existing consumers keep
// importing it from "@/lib/auth-api".
export type { AuditEvent };

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function authRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      let message: string;
      try {
        message = JSON.parse(body).error || body;
      } catch {
        message = body;
      }
      // Carry the HTTP status on the error so callers can tell a DEFINITIVE auth
      // failure (401/403) from a transient one (5xx/network) — the token-refresh
      // path must only log out on the former.
      const err = new Error(message) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }

    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out. Is the backend running?");
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export interface LoginResponse {
  access_token?: string;
  refresh_token?: string;
  user?: AuthUser;
  requires_2fa?: boolean;
  temp_token?: string;
}

export function register(
  email: string,
  username: string,
  password: string,
): Promise<{ success: boolean; user: AuthUser }> {
  return authRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, username, password }),
  });
}

export function login(email: string, password: string): Promise<LoginResponse> {
  return authRequest("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function refreshToken(
  refresh_token: string,
): Promise<{ access_token: string; refresh_token: string }> {
  return authRequest("/api/auth/refresh", {
    method: "POST",
    body: JSON.stringify({ refresh_token }),
  });
}

export function logout(refresh_token: string): Promise<void> {
  return authRequest("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({ refresh_token }),
  });
}

export function forgotPassword(email: string): Promise<{ success: boolean }> {
  return authRequest("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function resetPassword(token: string, new_password: string): Promise<{ success: boolean }> {
  return authRequest("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password }),
  });
}

export function verifyEmail(token: string): Promise<{ success: boolean }> {
  return authRequest("/api/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export function resendVerification(email: string): Promise<{ success: boolean }> {
  return authRequest("/api/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function setup2FA(accessToken: string): Promise<{ secret: string; uri: string }> {
  return authRequest("/api/auth/2fa/setup", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function enable2FA(accessToken: string, code: string): Promise<{ success: boolean }> {
  return authRequest("/api/auth/2fa/enable", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ code }),
  });
}

export function verify2FA(temp_token: string, code: string): Promise<LoginResponse> {
  return authRequest("/api/auth/2fa/verify", {
    method: "POST",
    body: JSON.stringify({ temp_token, code }),
  });
}

export function disable2FA(
  accessToken: string,
  password: string,
  code: string,
): Promise<{ success: boolean }> {
  return authRequest("/api/auth/2fa/disable", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ password, code }),
  });
}

export function getMe(accessToken: string): Promise<AuthUser> {
  return authRequest("/api/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function updateProfile(
  accessToken: string,
  profile: { display_name: string; avatar_url: string },
): Promise<AuthUser> {
  return authRequest("/api/auth/profile", {
    method: "PATCH",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(profile),
  });
}

/** Resolves to a breach warning instead of throwing when the new password
 *  appears in a breach corpus; re-send with force to accept it anyway. */
export function changePassword(
  accessToken: string,
  currentPassword: string,
  newPassword: string,
  force = false,
): Promise<{ ok?: boolean; warning?: string; breach_count?: number; requires?: string }> {
  return authRequest("/api/auth/change-password", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      force,
    }),
  });
}

// --- Magic Links ---

export function requestMagicLink(email: string): Promise<{ success: boolean; message: string }> {
  return authRequest("/api/auth/magic-link", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export function verifyMagicLink(token: string): Promise<LoginResponse> {
  return authRequest("/api/auth/magic-link/verify", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

// --- Register with breach detection ---

// The common shape returned by the breach-aware auth endpoints (register +
// reset-password): a success flag plus optional breach warning fields.
export interface BreachCheckResponse {
  success?: boolean;
  warning?: string;
  breach_count?: number;
  requires?: string;
}

export interface RegisterResponse extends BreachCheckResponse {
  user?: AuthUser;
}

export function registerWithBreachCheck(
  email: string,
  username: string,
  password: string,
  force = false,
): Promise<RegisterResponse> {
  return authRequest("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, username, password, force }),
  });
}

export function resetPasswordWithBreachCheck(
  token: string,
  new_password: string,
  force = false,
): Promise<BreachCheckResponse> {
  return authRequest("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password, force }),
  });
}

// --- Linked Accounts ---

export interface LinkedAccountsResponse {
  providers: Array<{
    id: string;
    provider: string;
    provider_email: string;
    created_at: string;
  }>;
  has_password: boolean;
}

export function getLinkedAccounts(accessToken: string): Promise<LinkedAccountsResponse> {
  return authRequest("/api/auth/linked-accounts", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

export function unlinkAccount(
  accessToken: string,
  provider: string,
): Promise<{ success: boolean }> {
  return authRequest(`/api/auth/linked-accounts/${provider}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// --- Activity ---
// (AuditEvent is re-exported from "@/types" at the top of this file.)

export function getUserActivity(accessToken: string): Promise<AuditEvent[]> {
  return authRequest("/api/auth/activity", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// --- OAuth ---

/**
 * The OAuth start URL. The backend sets the CSRF state cookie on whichever
 * host serves this request and registers its callback on BACKEND_URL
 * (www.zcrypt.cloud), so the start leg must hit that same host or the cookie
 * never reaches the callback and sign-in fails with "missing state". On the
 * web the page is already on that origin and /api/* is proxied there, so a
 * relative URL is correct; the Tauri static export has no proxy and must use
 * the absolute origin it was built with.
 */
export function getOAuthURL(provider: string): string {
  const base = isTauri ? API_BASE : "";
  return `${base}/api/auth/oauth/${provider}`;
}
