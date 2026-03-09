import type { FileMetadata, PlatformStatus, RepoInfo, AppConfig, IncompleteUpload, AdminUser, SystemStats, PlatformTokenInfo, QuotaInfo } from "@/types";
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

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const { accessToken } = useAuthStore.getState();

  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  let res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

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

export type UploadProgressCallback = (percent: number) => void;

export function pushFile(
  file: File,
  passphrase: string,
  platform?: string,
  onUploadProgress?: UploadProgressCallback
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    form.append("passphrase", passphrase);
    if (platform) form.append("platform", platform);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE}/api/push`);

    // Attach auth token (XHR bypasses the request() wrapper)
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    }

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onUploadProgress) {
        onUploadProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body);
        } else {
          reject(new Error(body.error || "Upload failed"));
        }
      } catch {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({});
        } else {
          reject(new Error("Upload failed"));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.ontimeout = () => reject(new Error("Upload timed out"));

    // No timeout - large files need time
    xhr.timeout = 0;

    xhr.send(form);
  });
}

export async function pullFile(filename: string, passphrase: string): Promise<Blob> {
  const { accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_BASE}/api/pull`, {
    method: "POST",
    headers,
    body: JSON.stringify({ filename, passphrase }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Download failed" }));
    throw new Error((body as Record<string, string>).error || "Download failed");
  }

  return res.blob();
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

export function pauseUpload(fileId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/upload/pause", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
}

export function resumeUpload(fileId: string): Promise<{ success: boolean; remaining_chunks: number; total_chunks: number }> {
  return request<{ success: boolean; remaining_chunks: number; total_chunks: number }>("/api/upload/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
}

export function listIncompleteUploads(): Promise<IncompleteUpload[]> {
  return request<IncompleteUpload[]>("/api/uploads/incomplete");
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
