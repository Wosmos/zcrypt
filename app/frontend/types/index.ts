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
  stage: string;
  percent: number;
  bytes_processed: number;
  total_bytes: number;
}

export interface AppConfig {
  has_github_token: boolean;
  default_platform: string;
  thresholds: Record<string, number>;
}

export type UploadStatus = "queued" | "sending" | "compressing" | "encrypting" | "uploading" | "done" | "failed";

export interface UploadItem {
  id: string;
  file: File;
  status: UploadStatus;
  progress: number;
  stage: string;
  startedAt: number;
  bytesProcessed?: number;
  totalBytes?: number;
  error?: string;
}
