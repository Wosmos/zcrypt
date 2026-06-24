/**
 * Upload session API — thin fetch wrappers for the chunked upload endpoints.
 *
 * All authenticated calls go through authedFetch, which refreshes the access
 * token on a 401 and retries. This is what lets a large upload survive past the
 * 15-minute access-token lifetime instead of dying mid-stream with
 * "invalid or expired token".
 */

import { authedFetch } from "@/lib/auth-fetch";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

async function handleResponse<T>(res: Response): Promise<T> {
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

async function throwIfNotOk(res: Response): Promise<void> {
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
}

export interface UploadInitParams {
  filename: string;
  original_size: number;
  sha256: string;
  salt: string; // base64
  wrapped_cek: string; // base64 envelope-wrapped Content Encryption Key
  chunk_count: number;
  platform?: string;
  /**
   * Destination folder (FIX-1b). When set, the backend creates the file row IN
   * this folder atomically at init — so a protected-folder file is born in its
   * folder and there is no stranding window (no separate best-effort move).
   * Omitted/null ⇒ the file is created at Root, exactly as before.
   */
  folder_id?: string | null;
}

export interface UploadInitResponse {
  session_id: string;
  file_id: string;
  platform: string;
  direct_upload: boolean;
}

/** POST /api/upload/init — start a new chunked upload session. */
export async function initUpload(params: UploadInitParams): Promise<UploadInitResponse> {
  const res = await authedFetch(`${API_BASE}/api/upload/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return handleResponse<UploadInitResponse>(res);
}

/** PUT /api/upload/{sid}/chunk/{idx} — upload a single encrypted chunk. */
export async function uploadChunk(
  sessionId: string,
  index: number,
  encryptedData: Uint8Array,
  sha256: string,
  compressed: boolean
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "X-Chunk-SHA256": sha256,
  };
  if (compressed) {
    headers["X-Chunk-Compressed"] = "true";
  }

  const res = await authedFetch(
    `${API_BASE}/api/upload/${sessionId}/chunk/${index}`,
    {
      method: "PUT",
      headers,
      body: encryptedData as BodyInit,
    }
  );
  await throwIfNotOk(res);
}

export interface PresignResponse {
  upload_url: string;
  upload_headers: Record<string, string> | null;
  remote_path: string;
  already_exists: boolean;
}

/** POST /api/upload/{sid}/presign/{idx} — get a presigned URL for direct upload. */
export async function presignChunk(
  sessionId: string,
  index: number,
  sha256: string,
  size: number
): Promise<PresignResponse> {
  const res = await authedFetch(
    `${API_BASE}/api/upload/${sessionId}/presign/${index}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sha256, size }),
    }
  );
  return handleResponse<PresignResponse>(res);
}

/** Upload data directly to a presigned platform URL with retries. */
export async function directUploadToURL(
  url: string,
  headers: Record<string, string> | null,
  data: Uint8Array
): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/octet-stream",
          ...(headers || {}),
        },
        body: data as BodyInit,
      });
      if (res.ok) return;
      lastError = new Error(`Direct upload failed: ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
  }
  throw lastError || new Error("Direct upload failed after retries");
}

/** POST /api/upload/{sid}/confirm/{idx} — confirm a directly-uploaded chunk. */
export async function confirmChunk(
  sessionId: string,
  index: number,
  sha256: string,
  size: number,
  remotePath: string,
  compressed: boolean
): Promise<void> {
  const res = await authedFetch(
    `${API_BASE}/api/upload/${sessionId}/confirm/${index}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sha256,
        size,
        remote_path: remotePath,
        compressed,
      }),
    }
  );
  await throwIfNotOk(res);
}

export interface UploadCompleteResponse {
  file_id: string;
}

/** POST /api/upload/{sid}/complete — finalize the upload session. */
export async function completeUpload(
  sessionId: string,
  encryptedSize: number,
  compressedSize: number
): Promise<UploadCompleteResponse> {
  const res = await authedFetch(`${API_BASE}/api/upload/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encrypted_size: encryptedSize, compressed_size: compressedSize }),
  });
  return handleResponse<UploadCompleteResponse>(res);
}

/** DELETE /api/upload/{sid} — cancel an upload session. */
export async function cancelUpload(sessionId: string): Promise<void> {
  const res = await authedFetch(`${API_BASE}/api/upload/${sessionId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body);
  }
}

export interface UploadStatusResponse {
  session_id: string;
  file_id: string;
  status: string;
  chunk_count: number;
  uploaded_chunks: number[]; // indices of chunks the server already has
  completed_count: number;
}

/** GET /api/upload/{sid}/status — check upload session progress. */
export async function getUploadStatus(sessionId: string): Promise<UploadStatusResponse> {
  const res = await authedFetch(`${API_BASE}/api/upload/${sessionId}/status`);
  return handleResponse<UploadStatusResponse>(res);
}
