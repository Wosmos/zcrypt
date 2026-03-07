const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...options?.headers,
    },
  });

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

export async function pushFile(file: File, passphrase: string): Promise<unknown> {
  const form = new FormData();
  form.append("file", file);
  form.append("passphrase", passphrase);

  const res = await fetch(`${API_BASE}/api/push`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Upload failed" }));
    throw new Error((body as Record<string, string>).error || "Upload failed");
  }

  return res.json();
}

export async function pullFile(filename: string, passphrase: string): Promise<Blob> {
  const res = await fetch(`${API_BASE}/api/pull`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, passphrase }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "Download failed" }));
    throw new Error((body as Record<string, string>).error || "Download failed");
  }

  return res.blob();
}

import type { FileMetadata, PlatformStatus, RepoInfo, AppConfig } from "@/types";

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

export function createEventSource(): EventSource {
  return new EventSource(`${API_BASE}/api/events`);
}
