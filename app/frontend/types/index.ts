export interface FileMetadata {
  id: string;
  original_name: string;
  original_size: number;
  compressed_size: number;
  encrypted_size: number;
  chunk_count: number;
  sha256: string;
  created_at: string;
}

export interface ChunkRef {
  chunk_id: string;
  file_id: string;
  index: number;
  size: number;
  sha256: string;
  platform: string;
  account?: string;
  repo: string;
  remote_path: string;
}

export interface RepoInfo {
  id: string;
  platform: string;
  account?: string;
  name: string;
  url: string;
  used_bytes: number;
  max_bytes: number;
  active: boolean;
}

export interface PlatformStatus {
  platform: string;
  account?: string;
  connected: boolean;
  username?: string;
  error?: string;
  token_id?: string;
  is_global?: boolean;
}

export interface ProgressEvent {
  file_id: string;
  stage: string;
  percent: number;
  bytes_processed: number;
  total_bytes: number;
}

export interface AppConfig {
  default_platform: string;
  thresholds: Record<string, number>;
  token_count: number;
}

export type UploadStatus = "queued" | "encrypting" | "uploading" | "done" | "failed";

export interface UploadItem {
  id: string;
  file: File;
  fileId?: string; // backend file ID for SSE routing
  status: UploadStatus;
  progress: number;
  stage: string;
  startedAt: number;
  bytesProcessed?: number;
  totalBytes?: number;
  error?: string;
}

export interface FileMetadataWithStatus extends FileMetadata {
  status: string;
}

export enum Role {
  User = "user",
  Admin = "admin",
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  role: Role;
  email_verified: boolean;
  totp_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Admin types
export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: Role;
  plan: string;
  email_verified: boolean;
  totp_enabled: boolean;
  file_count: number;
  total_size: number;
  storage_quota: number | null;
  created_at: string;
  updated_at: string;
}

export interface SystemStats {
  total_users: number;
  total_files: number;
  total_size: number;
  total_repos: number;
}

export interface QuotaInfo {
  used_bytes: number;
  quota_bytes: number;
  has_personal_key: boolean;
  is_unlimited: boolean;
  plan: string;
  max_concurrent_uploads: number;
  max_file_size: number;
  can_upload: boolean;
  allows_byob: boolean;
}

export interface PlatformTokenInfo {
  id: string;
  user_id: string;
  username: string;
  platform: string;
  is_global: boolean;
  created_at: string;
}

// Plan configuration types (dynamic, managed via admin)
export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface PlanConfig {
  id: string;
  name: string;
  monthly_price: number;
  annual_price: number;
  description: string;
  storage_bytes: number;
  max_file_bytes: number;
  max_concurrent_uploads: number;
  storage_display: string;
  max_file_display: string;
  concurrent_display: string;
  features: PlanFeature[];
  highlight: boolean;
  badge: string | null;
  icon: string | null;
  social_proof: string | null;
  sort_order: number;
}

export interface PlanConfigs {
  plans: PlanConfig[];
}

// Share link types
export interface ShareLink {
  id: string;
  file_id: string;
  token: string;
  has_password: boolean;
  expires_at: string | null;
  max_downloads: number;
  download_count: number;
  revoked: boolean;
  created_at: string;
}

export interface ShareInfo {
  valid: boolean;
  reason?: string;
  file_name: string;
  file_size: number;
  chunk_count: number;
  has_password: boolean;
}

// Anonymous Send types
export interface SendInitRequest {
  filename: string;
  original_size: number;
  sha256: string;
  salt: string;
  chunk_count: number;
  burn_after_read?: boolean;
  expires_hours?: number;
}

export interface SendInitResponse {
  session_id: string;
  token: string;
  platform: string;
}

export interface SendInfo {
  valid: boolean;
  reason?: string;
  file_name: string;
  file_size: number;
  burn_after_read: boolean;
  expires_at: string;
}

export interface SendMeta {
  salt: string;
  sha256: string;
  chunk_count: number;
  original_size: number;
}

// Pad types
export interface PadCreateRequest {
  encrypted_blob: string; // base64-encoded
  content_size: number;
  burn_after_read?: boolean;
  expires_hours?: number;
}

export interface PadInfo {
  valid: boolean;
  reason?: string;
  content_size: number;
  burn_after_read: boolean;
  expires_at: string;
}

// Clipboard sync
export interface ClipboardItem {
  id: string;
  user_id: string;
  content_type: "text" | "image" | "link";
  content_size: number;
  created_at: string;
}

export interface ClipboardPushRequest {
  content_type: "text" | "image" | "link";
  encrypted_blob: string; // base64
  content_size: number;
}

// Selective folder sync
export interface SyncFolder {
  id: string;
  user_id: string;
  folder_path: string;
  label: string;
  device_name: string;
  enabled: boolean;
  last_synced?: string;
  file_count: number;
  total_size: number;
  created_at: string;
  updated_at: string;
}

export interface SyncFolderRequest {
  folder_path: string;
  label?: string;
  device_name?: string;
  enabled?: boolean;
}

// Plausible deniability
export interface DecoyStatus {
  configured: boolean;
  enabled: boolean;
  file_count: number;
  created_at?: string;
}

export interface DecoyFile {
  id: string;
  user_id: string;
  original_name: string;
  original_size: number;
  created_at: string;
}

// Dead man's switch
export interface DeadManSwitch {
  id: string;
  user_id: string;
  contact_email: string;
  contact_name: string;
  timeout_days: number;
  message: string;
  include_files: boolean;
  enabled: boolean;
  last_checkin: string;
  triggered: boolean;
  triggered_at?: string;
  created_at: string;
}

export interface DeadManSwitchRequest {
  contact_email: string;
  contact_name: string;
  timeout_days: number;
  message: string;
  include_files: boolean;
  enabled?: boolean;
}

// Expiring vaults
export interface ExpiringVault {
  id: string;
  user_id: string;
  name: string;
  description: string;
  expires_at: string;
  expired: boolean;
  file_ids: string[];
  created_at: string;
}

export interface ExpiringVaultRequest {
  name: string;
  description: string;
  expires_at: string;
  file_ids: string[];
}

// Secure notes
export interface Note {
  id: string;
  user_id: string;
  encrypted_title: string; // base64
  encrypted_body: string;  // base64
  content_size: number;
  tags: string[];
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export interface NoteRequest {
  encrypted_title: string;
  encrypted_body: string;
  content_size: number;
  tags: string[];
  pinned?: boolean;
}

// File integrity monitor
export interface IntegritySnapshot {
  id: string;
  user_id: string;
  file_id: string;
  file_name: string;
  sha256: string;
  size: number;
  status: "ok" | "changed" | "missing";
  checked_at: string;
  created_at: string;
}

// Vault snapshots
export interface VaultSnapshot {
  id: string;
  user_id: string;
  label: string;
  file_count: number;
  total_size: number;
  file_ids: string[];
  created_at: string;
}

// Shared vaults
export interface SharedVault {
  id: string;
  name: string;
  owner_id: string;
  description: string;
  file_ids: string[];
  created_at: string;
  updated_at: string;
}

export interface SharedVaultMember {
  id: string;
  vault_id: string;
  user_id: string;
  username?: string;
  email?: string;
  role: "viewer" | "editor" | "admin";
  joined_at: string;
}

export interface SharedVaultDetail extends SharedVault {
  members: SharedVaultMember[];
}

// Offline pins
export interface OfflinePin {
  id: string;
  user_id: string;
  file_id: string;
  device_id: string;
  pinned_at: string;
}

// Admin user detail (matches backend JSON keys exactly)
export interface AdminUserDetail {
  user: AdminUser;
  file_count: number;
  used_bytes: number;
  quota_bytes: number;
  events: Array<{
    id: string;
    user_id?: string;
    event_type: string;
    ip: string;
    user_agent: string;
    metadata: Record<string, unknown>;
    created_at: string;
  }>;
}
