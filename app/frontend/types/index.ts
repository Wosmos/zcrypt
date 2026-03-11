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
}

export interface PlatformTokenInfo {
  id: string;
  user_id: string;
  username: string;
  platform: string;
  is_global: boolean;
  owner_email: string;
  created_at: string;
}
