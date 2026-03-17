import type { FileMetadata, PlatformStatus, RepoInfo, AppConfig, AdminUser, SystemStats, PlatformTokenInfo, QuotaInfo, PlanConfigs, AdminUserDetail, ShareLink, ShareInfo } from "@/types";
import { useAuthStore } from "@/store/auth";
import { refreshToken as refreshTokenApi } from "@/lib/auth-api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

let refreshPromise: Promise<string | null> | null = null;

async function tryRefreshToken(): Promise<string | null> {
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

async function request<T>(path: string, options?: RequestInit, retries = 2): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  // Timeout: use caller's signal or default 30s
  const controller = options?.signal ? undefined : new AbortController();
  const timeoutId = controller ? setTimeout(() => controller.abort(), 30_000) : undefined;
  const signal = options?.signal ?? controller?.signal;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal,
    });
  } catch (err) {
    if (timeoutId) clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new Error("Request timed out");
    }
    throw err;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  // On 401, try refreshing the token and retry once
  if (res.status === 401 && accessToken) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
      });
    }
  }

  // Retry on 5xx server errors with backoff
  if (res.status >= 500 && retries > 0) {
    await new Promise((r) => setTimeout(r, 1000 * (3 - retries)));
    return request<T>(path, options, retries - 1);
  }

  if (!res.ok) {
    const body = await res.text();
    let message: string;
    try {
      const parsed = JSON.parse(body);
      message = parsed.error || body;
    } catch {
      message = body;
    }
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ─── File Meta & Chunk Download (client-side decryption) ───

export interface FileMetaResponse {
  id: string;
  original_name: string;
  original_size: number;
  compressed_size: number;
  encrypted_size: number;
  chunk_count: number;
  sha256: string;
  salt: string; // base64
  status: string;
  created_at: string;
}

export function getFileMeta(fileId: string): Promise<FileMetaResponse> {
  return request<FileMetaResponse>(`/api/files/${fileId}/meta`);
}

/** Download a single encrypted chunk. Returns raw bytes + metadata headers. */
export async function getFileChunk(fileId: string, index: number): Promise<{
  data: ArrayBuffer;
  sha256: string;
  compressed: boolean;
}> {
  const { accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}/api/files/${fileId}/chunks/${index}`, { headers });

  if (!res.ok) {
    const body = await res.text();
    let message: string;
    try {
      const parsed = JSON.parse(body);
      message = parsed.error || body;
    } catch {
      message = body;
    }
    throw new Error(message);
  }

  return {
    data: await res.arrayBuffer(),
    sha256: res.headers.get("X-Chunk-SHA256") || "",
    compressed: res.headers.get("X-Chunk-Compressed") === "true",
  };
}

export function listFiles(filter?: string): Promise<FileMetadata[]> {
  const params = filter ? `?filter=${encodeURIComponent(filter)}` : "";
  return request<FileMetadata[]>(`/api/files${params}`);
}

export function deleteFile(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/files/${id}`, { method: "DELETE" });
}

export function getPlatformStatus(): Promise<PlatformStatus[]> {
  return request<PlatformStatus[]>("/api/platforms/status");
}

export function connectPlatform(platform: string, token: string): Promise<{ success: boolean; username?: string }> {
  return request<{ success: boolean; username?: string }>("/api/platforms/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform, token }),
  });
}

export function disconnectPlatform(platform: string, username: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/platforms/disconnect", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform, username }),
  });
}

export function toggleTokenScope(tokenId: string, isGlobal: boolean): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/platforms/tokens/${tokenId}/scope`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_global: isGlobal }),
  });
}

export function listRepos(): Promise<RepoInfo[]> {
  return request<RepoInfo[]>("/api/repos");
}

export function getConfig(): Promise<AppConfig> {
  return request<AppConfig>("/api/config");
}

export function updateConfig(updates: Record<string, unknown>): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/config", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export function createEventSource(): EventSource {
  const { accessToken } = useAuthStore.getState();
  const params = accessToken ? `?token=${encodeURIComponent(accessToken)}` : "";
  return new EventSource(`${API_BASE}/api/events${params}`);
}

// ─── Admin API ───

export function adminListUsers(): Promise<AdminUser[]> {
  return request<AdminUser[]>("/api/admin/users");
}

export function adminGetStats(): Promise<SystemStats> {
  return request<SystemStats>("/api/admin/stats");
}

export function adminSetUserRole(userId: string, role: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/admin/users/${userId}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export function adminDeleteUser(userId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/admin/users/${userId}`, {
    method: "DELETE",
  });
}

export function adminListTokens(): Promise<PlatformTokenInfo[]> {
  return request<PlatformTokenInfo[]>("/api/admin/tokens");
}

export function adminCreateToken(data: {
  user_id?: string;
  platform: string;
  token: string;
  is_global: boolean;
}): Promise<{ success: boolean; username: string }> {
  return request<{ success: boolean; username: string }>("/api/admin/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function adminDeleteToken(tokenId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/admin/tokens/${tokenId}`, {
    method: "DELETE",
  });
}

export function adminToggleTokenScope(tokenId: string, isGlobal: boolean): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/admin/tokens/${tokenId}/scope`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ is_global: isGlobal }),
  });
}

// ─── Quota API ───

export function getQuota(): Promise<QuotaInfo> {
  return request<QuotaInfo>("/api/quota");
}

export function adminGetDefaultQuota(): Promise<{ default_quota_bytes: number }> {
  return request<{ default_quota_bytes: number }>("/api/admin/quota");
}

export function adminSetDefaultQuota(bytes: number): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/admin/quota", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ default_quota_bytes: bytes }),
  });
}

export function adminSetUserPlan(userId: string, plan: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/admin/users/${userId}/plan`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ plan }),
  });
}

export function adminSetUserQuota(userId: string, quotaBytes: number | null): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/admin/users/${userId}/quota`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quota_bytes: quotaBytes }),
  });
}

// ─── Admin Audit API ───

export interface AdminAuditResponse {
  events: Array<{
    id: string;
    user_id?: string;
    event_type: string;
    ip: string;
    user_agent: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
  total: number;
}

// ─── Feedback API ───

export function submitFeedback(data: { rating: number; message: string; context: string }): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function getFeedbackStatus(): Promise<{ submitted: boolean }> {
  return request<{ submitted: boolean }>("/api/feedback/status");
}

export interface AdminFeedbackResponse {
  feedback: Array<{
    id: string;
    user_id: string;
    rating: number;
    message: string;
    context: string;
    created_at: string;
    email: string;
    username: string;
  }>;
  total: number;
}

export function adminListFeedback(limit = 20, offset = 0): Promise<AdminFeedbackResponse> {
  return request<AdminFeedbackResponse>(`/api/admin/feedback?limit=${limit}&offset=${offset}`);
}

// ─── Admin Audit API ───

export function adminGetAuditLog(params: {
  limit?: number;
  offset?: number;
  event_type?: string;
  user_id?: string;
}): Promise<AdminAuditResponse> {
  const qs = new URLSearchParams();
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.offset) qs.set("offset", String(params.offset));
  if (params.event_type) qs.set("event_type", params.event_type);
  if (params.user_id) qs.set("user_id", params.user_id);
  return request<AdminAuditResponse>(`/api/admin/audit?${qs.toString()}`);
}

// ─── Plans API ───

/** Public — no auth required. Fetches plan configs for landing/pricing pages. */
export async function getPlans(): Promise<PlanConfigs> {
  const res = await fetch(`${API_BASE}/api/plans`);
  if (!res.ok) throw new Error("Failed to fetch plans");
  return res.json();
}

export function adminGetPlans(): Promise<PlanConfigs> {
  return request<PlanConfigs>("/api/admin/plans");
}

export function adminSetPlans(plans: PlanConfigs): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/admin/plans", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plans),
  });
}

// ─── Admin User Detail ───

export function adminGetUser(userId: string): Promise<AdminUserDetail> {
  return request<AdminUserDetail>(`/api/admin/users/${userId}`);
}

// ─── Shares API (authenticated) ───

export function createShare(data: {
  file_id: string;
  password?: string;
  expires_in_hours?: number;
  max_downloads?: number;
}): Promise<{ id: string; token: string }> {
  return request<{ id: string; token: string }>("/api/shares", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function listShares(fileId?: string): Promise<ShareLink[]> {
  const params = fileId ? `?file_id=${fileId}` : "";
  return request<ShareLink[]>(`/api/shares${params}`);
}

export function revokeShare(shareId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/shares/${shareId}`, { method: "DELETE" });
}

// ─── Public Share Access (no auth) ───

export async function getShareInfo(token: string): Promise<ShareInfo> {
  const res = await fetch(`${API_BASE}/api/share/${token}`);
  if (!res.ok) throw new Error("Share not found");
  return res.json();
}

export async function getShareFileMeta(token: string, password?: string): Promise<FileMetaResponse> {
  const headers: Record<string, string> = {};
  if (password) headers["X-Share-Password"] = password;
  const res = await fetch(`${API_BASE}/api/share/${token}/meta`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to get file metadata");
  }
  return res.json();
}

export async function getShareChunk(token: string, index: number, password?: string): Promise<{
  data: ArrayBuffer;
  sha256: string;
  compressed: boolean;
}> {
  const headers: Record<string, string> = {};
  if (password) headers["X-Share-Password"] = password;
  const res = await fetch(`${API_BASE}/api/share/${token}/chunks/${index}`, { headers });
  if (!res.ok) throw new Error("Failed to download chunk");
  return {
    data: await res.arrayBuffer(),
    sha256: res.headers.get("X-Chunk-SHA256") || "",
    compressed: res.headers.get("X-Chunk-Compressed") === "true",
  };
}
