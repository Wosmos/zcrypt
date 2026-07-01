import type { FileMetadata, Folder, FolderRequest, PlatformStatus, RepoInfo, AppConfig, AdminUser, SystemStats, PlatformTokenInfo, QuotaInfo, PlanConfigs, AdminUserDetail, ShareLink, ShareInfo, SendInitRequest, SendInitResponse, SendInfo, SendMeta, PadCreateRequest, PadInfo, ClipboardItem, ClipboardPushRequest, SyncFolder, SyncFolderRequest, DecoyStatus, DecoyFile, DeadManSwitch, DeadManSwitchRequest, ExpiringVault, ExpiringVaultRequest, IntegritySnapshot, VaultSnapshot, SharedVault, SharedVaultDetail, SharedVaultMember, OfflinePin } from "@/types";
import { useAuthStore } from "@/store/auth";
import { tryRefreshToken } from "@/lib/auth-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

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

// ─── Per-device UI preferences (color theme + light/dark mode) ───

export interface DevicePreference {
  device_id: string;
  color_theme: string;
  mode: string;
  updated_at: string;
  /** False when no row exists yet on the server (fields are then defaults). */
  saved: boolean;
}

export function getDevicePreference(deviceId: string): Promise<DevicePreference> {
  return request<DevicePreference>(
    `/api/preferences?device_id=${encodeURIComponent(deviceId)}`
  );
}

export function saveDevicePreference(pref: {
  device_id: string;
  color_theme: string;
  mode: string;
}): Promise<DevicePreference> {
  return request<DevicePreference>(`/api/preferences`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(pref),
  });
}

// ─── Per-user keypairs (zero-knowledge sharing foundation) ───

export interface UserKeyRecord {
  user_id: string;
  public_key: string;
  wrapped_private_key: string;
  kdf_salt: string;
  fingerprint: string;
  updated_at: string;
}

export interface PublicKeyRecord {
  user_id: string;
  public_key: string;
  fingerprint: string;
}

/** The caller's own key record (incl. the wrapped private key), or null if
 *  they haven't published a keypair yet. */
export function getMyKey(): Promise<UserKeyRecord | null> {
  return request<UserKeyRecord | null>("/api/keys/me");
}

/** Publish (or rotate) the caller's keypair. Every field is produced
 *  client-side; wrapped_private_key is opaque ciphertext to the server. */
export function publishKey(body: {
  public_key: string;
  wrapped_private_key: string;
  kdf_salt: string;
  fingerprint: string;
}): Promise<{ success: boolean }> {
  return request(`/api/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Another user's PUBLIC key (for wrapping a shared-space key to them). */
export function getUserPublicKey(userId: string): Promise<PublicKeyRecord> {
  return request<PublicKeyRecord>(`/api/keys/user/${encodeURIComponent(userId)}`);
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
  wrapped_cek?: string; // base64 envelope-wrapped Content Encryption Key (empty for legacy files)
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

export function bulkDeleteFiles(ids: string[]): Promise<{ deleted: number; failed: number }> {
  return request<{ deleted: number; failed: number }>("/api/files/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
}

// ─── Folders + Trash (authenticated) ───
// Folder/file names are encrypted client-side (see lib/name-crypto.ts); the
// server only ever sees opaque ciphertext in `encrypted_name`.

const JSON_HEADERS = { "Content-Type": "application/json" } as const;

export function listFolders(parentId?: string | null): Promise<Folder[]> {
  const params = parentId ? `?parent_id=${encodeURIComponent(parentId)}` : "";
  return request<Folder[]>(`/api/folders${params}`);
}

export function createFolder(data: FolderRequest): Promise<Folder> {
  return request<Folder>("/api/folders", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(data) });
}

export function renameFolder(id: string, encryptedName: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/folders/${id}`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ encrypted_name: encryptedName }) });
}

export function moveFolder(id: string, parentId: string | null): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/folders/${id}/move`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ parent_id: parentId }) });
}

export function deleteFolder(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/folders/${id}`, { method: "DELETE" });
}

export function moveFile(id: string, folderId: string | null): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/files/${id}/move`, { method: "PATCH", headers: JSON_HEADERS, body: JSON.stringify({ folder_id: folderId }) });
}

// ─── Per-Folder Password Protection (zero-knowledge) ───
// The folder password never leaves the device. The client derives a salt +
// verifier (see lib/folder-crypto.ts) and sends only those opaque base64 blobs;
// the server stores them but can never recover the password.

/** Set/replace a folder's password protection. `pw_salt` + `pw_verifier` are base64. */
export function setFolderPassword(id: string, pw_salt: string, pw_verifier: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/folders/${id}/password`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ pw_salt, pw_verifier }) });
}

/** Remove a folder's password protection (server nulls both columns). The client
 *  must re-key the folder's files back to the vault passphrase BEFORE calling this. */
export function removeFolderPassword(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/folders/${id}/password`, { method: "DELETE" });
}

/** Re-key a file: update ONLY its `salt` (base64) + `wrapped_cek` (base64) when it
 *  crosses a protection boundary. The server never sees keys. */
export function rekeyFile(id: string, salt: string, wrapped_cek: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/files/${id}/rekey`, { method: "PUT", headers: JSON_HEADERS, body: JSON.stringify({ salt, wrapped_cek }) });
}

export function listTrash(): Promise<FileMetadata[]> {
  return request<FileMetadata[]>("/api/files/trash");
}

export function restoreFile(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/files/${id}/restore`, { method: "POST" });
}

/** Permanently delete a file + remove its chunks from storage (irreversible). */
export function purgeFile(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/files/${id}/purge`, { method: "DELETE" });
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

export interface TelegramDetectedChat {
  id: string;
  title: string;
  type: "channel" | "group" | "supergroup";
}

export interface TelegramProbeResult {
  bot_username: string;
  chats: TelegramDetectedChat[];
  /** Present when the token is valid but auto-detection couldn't run (e.g. the
   *  bot has a webhook set) — the UI should suggest the manual fallback. */
  detect_error?: string;
}

/** Validate a Telegram bot token and detect channels/groups it was added to.
 *  Stores nothing — the guided connect flow polls this after the user adds the
 *  bot to a chat via a deep link, so the chat ID is auto-filled. */
export function telegramProbe(botToken: string): Promise<TelegramProbeResult> {
  return request<TelegramProbeResult>("/api/platforms/telegram/probe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bot_token: botToken }),
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
  wrapped_cek?: string;
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

// ─── Folder Shares (public folder links) ───

export interface FolderShareFileEntry {
  file_id: string;
  wrapped_cek?: string;
  name?: string;
  size?: number;
  chunk_count?: number;
}

export interface FolderShareInfo {
  valid: boolean;
  has_password: boolean;
  name: string;
  reason?: string;
  files?: FolderShareFileEntry[];
}

export interface FolderShareLink {
  id: string;
  folder_id?: string;
  name: string;
  token: string;
  has_password: boolean;
  expires_at?: string;
  max_downloads: number;
  download_count: number;
  revoked: boolean;
  created_at: string;
  file_count: number;
}

/** Create a public folder link (authenticated). The folder-share key never
 *  leaves the browser — only the per-file wrapped CEKs are sent. */
export function createFolderShare(body: {
  folder_id?: string;
  name: string;
  files: { file_id: string; wrapped_cek: string }[];
  password?: string;
  expires_in_hours?: number;
  max_downloads?: number;
}): Promise<{ id: string; token: string }> {
  return request(`/api/folder-shares`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function listFolderShares(folderId?: string): Promise<FolderShareLink[]> {
  const params = folderId ? `?folder_id=${folderId}` : "";
  return request<FolderShareLink[]>(`/api/folder-shares${params}`);
}

export function revokeFolderShare(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/folder-shares/${id}`, { method: "DELETE" });
}

// Public folder-link access (no auth, rate-limited). The optional password
// unlocks the file listing for a password-protected link.
export async function getFolderShareInfo(token: string, password?: string): Promise<FolderShareInfo> {
  const headers: Record<string, string> = {};
  if (password) headers["X-Share-Password"] = password;
  const res = await fetch(`${API_BASE}/api/folder-share/${token}`, { headers });
  if (!res.ok) throw new Error("Folder link not found");
  return res.json();
}

export async function getFolderShareFileMeta(
  token: string,
  fileId: string,
  password?: string
): Promise<FileMetaResponse> {
  const headers: Record<string, string> = {};
  if (password) headers["X-Share-Password"] = password;
  const res = await fetch(`${API_BASE}/api/folder-share/${token}/files/${fileId}/meta`, { headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to get file metadata");
  }
  return res.json();
}

export async function getFolderShareChunk(
  token: string,
  fileId: string,
  index: number,
  password?: string
): Promise<{ data: ArrayBuffer; sha256: string; compressed: boolean }> {
  const headers: Record<string, string> = {};
  if (password) headers["X-Share-Password"] = password;
  const res = await fetch(`${API_BASE}/api/folder-share/${token}/files/${fileId}/chunks/${index}`, { headers });
  if (!res.ok) throw new Error("Failed to download chunk");
  return {
    data: await res.arrayBuffer(),
    sha256: res.headers.get("X-Chunk-SHA256") || "",
    compressed: res.headers.get("X-Chunk-Compressed") === "true",
  };
}

// ─── Anonymous Send API (no auth) ───

export async function sendInit(data: SendInitRequest): Promise<SendInitResponse> {
  const res = await fetch(`${API_BASE}/api/send/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to start send");
  }
  return res.json();
}

export async function sendChunkUpload(
  sessionId: string,
  idx: number,
  chunk: Uint8Array,
  sha256: string,
  compressed: boolean,
): Promise<void> {
  const headers: Record<string, string> = {
    "X-Chunk-SHA256": sha256,
  };
  if (compressed) headers["X-Chunk-Compressed"] = "true";

  const res = await fetch(`${API_BASE}/api/send/${sessionId}/chunk/${idx}`, {
    method: "PUT",
    headers,
    body: chunk as unknown as BodyInit,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to upload chunk");
  }
}

export async function sendComplete(sessionId: string): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/api/send/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to complete send");
  }
  return res.json();
}

export async function getSendInfo(token: string): Promise<SendInfo> {
  const res = await fetch(`${API_BASE}/api/send/${token}`);
  if (!res.ok) throw new Error("Transfer not found");
  return res.json();
}

export async function getSendMeta(token: string): Promise<SendMeta> {
  const res = await fetch(`${API_BASE}/api/send/${token}/meta`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to get transfer metadata");
  }
  return res.json();
}

export async function getSendChunk(token: string, idx: number): Promise<{
  data: ArrayBuffer;
  sha256: string;
  compressed: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/send/${token}/chunks/${idx}`);
  if (!res.ok) throw new Error("Failed to download chunk");
  return {
    data: await res.arrayBuffer(),
    sha256: res.headers.get("X-Chunk-SHA256") || "",
    compressed: res.headers.get("X-Chunk-Compressed") === "true",
  };
}

// ─── Pad (anonymous encrypted text sharing) ─────────────────────────────────

export async function createPad(data: PadCreateRequest): Promise<{ token: string }> {
  const res = await fetch(`${API_BASE}/api/pad`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to create pad");
  }
  return res.json();
}

export async function getPadInfo(token: string): Promise<PadInfo> {
  const res = await fetch(`${API_BASE}/api/pad/${token}`);
  if (!res.ok) throw new Error("Pad not found");
  return res.json();
}

export async function getPadContent(token: string): Promise<ArrayBuffer> {
  const res = await fetch(`${API_BASE}/api/pad/${token}/content`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Failed to get pad content");
  }
  return res.arrayBuffer();
}

// ─── Clipboard Sync (authenticated) ──────────────────────────────────────────

export function pushClipboard(data: ClipboardPushRequest): Promise<{ id: string; created_at: string }> {
  return request<{ id: string; created_at: string }>("/api/clipboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function listClipboard(): Promise<ClipboardItem[]> {
  return request<ClipboardItem[]>("/api/clipboard");
}

export async function getClipboardContent(id: string): Promise<{ data: ArrayBuffer; contentType: string }> {
  const { accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE}/api/clipboard/${id}`, { headers });
  if (!res.ok) throw new Error("Failed to get clipboard content");
  return {
    data: await res.arrayBuffer(),
    contentType: res.headers.get("X-Content-Type") || "text",
  };
}

export function deleteClipboardItem(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/clipboard/${id}`, { method: "DELETE" });
}

// ─── Selective Folder Sync (authenticated) ───────────────────────────────────

export function listSyncFolders(): Promise<SyncFolder[]> {
  return request<SyncFolder[]>("/api/sync/folders");
}

export function createSyncFolder(data: SyncFolderRequest): Promise<SyncFolder> {
  return request<SyncFolder>("/api/sync/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateSyncFolder(id: string, data: { enabled?: boolean; label?: string }): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/sync/folders/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteSyncFolder(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/sync/folders/${id}`, { method: "DELETE" });
}

// ─── Decoy Vault (Plausible Deniability) ─────────────────────────────────────

export function getDecoyStatus(): Promise<DecoyStatus> {
  return request<DecoyStatus>("/api/decoy");
}

export function setupDecoy(data: { decoy_password: string; enabled?: boolean }): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/decoy/setup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteDecoy(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/decoy", { method: "DELETE" });
}

export function listDecoyFiles(): Promise<DecoyFile[]> {
  return request<DecoyFile[]>("/api/decoy/files");
}

export function addDecoyFile(data: { name: string; size: number }): Promise<DecoyFile> {
  return request<DecoyFile>("/api/decoy/files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteDecoyFile(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/decoy/files/${id}`, { method: "DELETE" });
}

// ─── Dead Man's Switch ──────────────────────────────────────────────────────

export function getDeadManSwitch(): Promise<DeadManSwitch | null> {
  return request<DeadManSwitch | null>("/api/deadman");
}

export function setupDeadManSwitch(data: DeadManSwitchRequest): Promise<DeadManSwitch> {
  return request<DeadManSwitch>("/api/deadman", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function checkinDeadManSwitch(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/deadman/checkin", { method: "POST" });
}

export function deleteDeadManSwitch(): Promise<{ success: boolean }> {
  return request<{ success: boolean }>("/api/deadman", { method: "DELETE" });
}

// ─── Expiring Vaults ────────────────────────────────────────────────────────

export function listExpiringVaults(): Promise<ExpiringVault[]> {
  return request<ExpiringVault[]>("/api/vaults");
}

export function createExpiringVault(data: ExpiringVaultRequest): Promise<ExpiringVault> {
  return request<ExpiringVault>("/api/vaults", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function getExpiringVault(id: string): Promise<ExpiringVault> {
  return request<ExpiringVault>(`/api/vaults/${id}`);
}

export function deleteExpiringVault(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/vaults/${id}`, { method: "DELETE" });
}

// ─── File Integrity Monitor ─────────────────────────────────────────────────

export function listIntegritySnapshots(): Promise<IntegritySnapshot[]> {
  return request<IntegritySnapshot[]>("/api/integrity");
}

export function createIntegritySnapshot(fileId: string): Promise<IntegritySnapshot> {
  return request<IntegritySnapshot>("/api/integrity", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
}

export function checkFileIntegrity(fileId: string): Promise<IntegritySnapshot> {
  return request<IntegritySnapshot>("/api/integrity/check", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  });
}

export function getChangedFiles(): Promise<IntegritySnapshot[]> {
  return request<IntegritySnapshot[]>("/api/integrity/changes");
}

// ─── Vault Snapshots ────────────────────────────────────────────────────────

export function listVaultSnapshots(): Promise<VaultSnapshot[]> {
  return request<VaultSnapshot[]>("/api/snapshots");
}

export function createVaultSnapshot(label: string): Promise<VaultSnapshot> {
  return request<VaultSnapshot>("/api/snapshots", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
}

export function getVaultSnapshot(id: string): Promise<VaultSnapshot> {
  return request<VaultSnapshot>(`/api/snapshots/${id}`);
}

export function deleteVaultSnapshot(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/snapshots/${id}`, { method: "DELETE" });
}

// ─── Shared Vaults ──────────────────────────────────────────────────────────

export function listSharedVaults(): Promise<SharedVault[]> {
  return request<SharedVault[]>("/api/shared-vaults");
}

export function createSharedVault(data: { name: string; description: string; file_ids: string[]; wrapped_space_key?: string; size_limit_bytes?: number }): Promise<SharedVault> {
  return request<SharedVault>("/api/shared-vaults", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function getSharedVault(id: string): Promise<SharedVaultDetail> {
  return request<SharedVaultDetail>(`/api/shared-vaults/${id}`);
}

export function addSharedVaultMember(vaultId: string, email: string, role: string, wrappedSpaceKey?: string): Promise<SharedVaultMember> {
  return request<SharedVaultMember>(`/api/shared-vaults/${vaultId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, role, wrapped_space_key: wrappedSpaceKey ?? "" }),
  });
}

/** Resolve a user's PUBLIC key by email/username (to seal a space key before
 *  inviting). Rejects (404) if no such user or they have no published key. */
export function lookupUserKey(identifier: string): Promise<PublicKeyRecord> {
  return request<PublicKeyRecord>(`/api/keys/lookup?identifier=${encodeURIComponent(identifier)}`);
}

export function removeSharedVaultMember(vaultId: string, userId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/shared-vaults/${vaultId}/members/${userId}`, { method: "DELETE" });
}

export function deleteSharedVault(id: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/shared-vaults/${id}`, { method: "DELETE" });
}

/** Share a file into a space. wrappedCek is the file's CEK re-wrapped under the
 *  space key (opaque to the server). Caller must be an editor/admin and own the
 *  file. */
export function addFileToSpace(vaultId: string, fileId: string, wrappedCek: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/shared-vaults/${vaultId}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId, wrapped_cek: wrappedCek }),
  });
}

/** Unshare a file from a space (editor/admin only). */
export function removeFileFromSpace(vaultId: string, fileId: string): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/shared-vaults/${vaultId}/files/${fileId}`, { method: "DELETE" });
}

/** Rotate a space's key (admin only): new key sealed to each remaining member,
 *  every file's CEK re-wrapped under it. All values are opaque to the server. */
export function rotateSpace(
  vaultId: string,
  members: { user_id: string; wrapped_space_key: string }[],
  files: { file_id: string; wrapped_cek: string }[]
): Promise<{ success: boolean }> {
  return request<{ success: boolean }>(`/api/shared-vaults/${vaultId}/rotate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ members, files }),
  });
}

// ─── Offline Pins ───────────────────────────────────────────────────────────

export function listOfflinePins(deviceId?: string): Promise<OfflinePin[]> {
  const params = deviceId ? `?device_id=${deviceId}` : "";
  return request<OfflinePin[]>(`/api/offline${params}`);
}

export function pinFileOffline(fileId: string, deviceId: string): Promise<OfflinePin> {
  return request<OfflinePin>("/api/offline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId, device_id: deviceId }),
  });
}

export function unpinFileOffline(fileId: string, deviceId?: string): Promise<{ success: boolean }> {
  const params = deviceId ? `?device_id=${deviceId}` : "";
  return request<{ success: boolean }>(`/api/offline/${fileId}${params}`, { method: "DELETE" });
}
