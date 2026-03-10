/**
 * Upload session API — thin fetch wrappers for the chunked upload endpoints.
 */

import { useAuthStore } from "@/store/auth";

const API_BASE = process.env.NEXT_PUBLIC_API_URL;

function authHeaders(): Record<string, string> {
  const { accessToken } = useAuthStore.getState();
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  return headers;
}

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

export interface UploadInitParams {
  filename: string;
  original_size: number;
  sha256: string;
  salt: string; // base64
  chunk_count: number;
  platform?: string;
}

export interface UploadInitResponse {
  session_id: string;
  file_id: string;
}

/** POST /api/upload/init — start a new chunked upload session. */
export async function initUpload(params: UploadInitParams): Promise<UploadInitResponse> {
  const res = await fetch(`${API_BASE}/api/upload/init`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
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
    ...authHeaders(),
  };
  if (compressed) {
    headers["X-Chunk-Compressed"] = "true";
  }

  const res = await fetch(
    `${API_BASE}/api/upload/${sessionId}/chunk/${index}`,
    {
      method: "PUT",
      headers,
      body: encryptedData as BodyInit,
    }
  );

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

export interface UploadCompleteResponse {
  file_id: string;
}

/** POST /api/upload/{sid}/complete — finalize the upload session. */
export async function completeUpload(
  sessionId: string,
  encryptedSize: number,
  compressedSize: number
): Promise<UploadCompleteResponse> {
  const res = await fetch(`${API_BASE}/api/upload/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ encrypted_size: encryptedSize, compressed_size: compressedSize }),
  });
  return handleResponse<UploadCompleteResponse>(res);
}

/** DELETE /api/upload/{sid} — cancel an upload session. */
export async function cancelUpload(sessionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/upload/${sessionId}`, {
    method: "DELETE",
    headers: authHeaders(),
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
  uploaded_chunks: number;
  chunk_count: number;
  completed_indices: number[];
}

/** GET /api/upload/{sid}/status — check upload session progress. */
export async function getUploadStatus(sessionId: string): Promise<UploadStatusResponse> {
  const res = await fetch(`${API_BASE}/api/upload/${sessionId}/status`, {
    headers: authHeaders(),
  });
  return handleResponse<UploadStatusResponse>(res);
}
