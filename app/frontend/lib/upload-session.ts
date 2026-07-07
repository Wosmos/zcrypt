/**
 * Upload session API — thin wrappers for the chunked upload endpoints.
 *
 * All authenticated calls refresh the access token on a 401 and retry (JSON
 * calls via authedFetch; chunk PUTs via the XHR helper below, which mirrors the
 * same contract). This is what lets a large upload survive past the 15-minute
 * access-token lifetime instead of dying mid-stream with
 * "invalid or expired token".
 *
 * Chunk payload PUTs (uploadChunk / directUploadToURL) use XMLHttpRequest
 * instead of fetch: fetch exposes NO upload progress, so the progress bar froze
 * for the entire flight of each 4-16MB chunk. xhr.upload.onprogress streams
 * sent-byte counts to the optional onProgress callback.
 */

import { authedFetch, tryRefreshToken } from "@/lib/auth-fetch";
import { useAuthStore } from "@/store/auth";

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

// Minimal XHR result — enough to reproduce the fetch error-handling shape
// (status check + server-message extraction) without touching Response.
interface XhrResult {
  status: number;
  body: string;
}

/**
 * PUT `data` to `url` via XMLHttpRequest, reporting upload progress.
 *
 * Rejects only on transport-level failures (network error / abort / timeout),
 * matching fetch semantics; HTTP error statuses resolve normally and are
 * handled by the caller. `onProgress` receives the number of BODY bytes the
 * browser has sent so far (monotonic within one attempt).
 */
function xhrPut(
  url: string,
  headers: Record<string, string>,
  data: Uint8Array,
  onProgress?: (sentBytes: number) => void,
  signal?: AbortSignal
): Promise<XhrResult> {
  // Stall watchdog. A fixed xhr.timeout would false-abort a large chunk on a
  // slow-but-progressing link, and NOT setting one (the old bug) let a dead
  // socket hang the promise forever — stalling the whole upload at ~95% with no
  // error. Instead we abort only when NO progress happens for STALL_MS: reset
  // the clock on every upload-progress tick, and again once the body is sent
  // (so a server that never responds is caught too). An abort rejects, so the
  // caller's retry can re-send the chunk.
  //
  // `signal` is the caller's pause/cancel abort: it kills the transfer
  // immediately and rejects with "Upload paused" — a message the store's retry
  // wrapper treats as a stop, never as a transient error to retry.
  const STALL_MS = 60_000;
  return new Promise<XhrResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("Upload paused"));
      return;
    }
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }
    let stalled = false;
    let externallyAborted = false;
    let stallTimer: ReturnType<typeof setTimeout>;
    const onSignalAbort = () => {
      externallyAborted = true;
      try { xhr.abort(); } catch { /* already settled */ }
    };
    signal?.addEventListener("abort", onSignalAbort, { once: true });
    const clearStall = () => {
      clearTimeout(stallTimer);
      signal?.removeEventListener("abort", onSignalAbort);
    };
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        try { xhr.abort(); } catch { /* already settled */ }
      }, STALL_MS);
    };
    // Always track upload progress for the watchdog; forward to the caller too.
    xhr.upload.onprogress = (e: ProgressEvent) => { armStall(); onProgress?.(e.loaded); };
    xhr.upload.onload = () => armStall(); // body sent — now watch for the response
    xhr.onload = () => { clearStall(); resolve({ status: xhr.status, body: xhr.responseText }); };
    xhr.onerror = () => { clearStall(); reject(new TypeError("Network request failed")); };
    xhr.onabort = () => {
      clearStall();
      reject(new Error(externallyAborted ? "Upload paused" : stalled ? "Upload stalled (no progress for 60s)" : "Upload aborted"));
    };
    xhr.ontimeout = () => { clearStall(); reject(new Error("Upload timed out")); };
    armStall(); // start the clock before the first byte
    xhr.send(data as unknown as XMLHttpRequestBodyInit);
  });
}

// Extract the server's error message from a non-2xx XHR body — same shape as
// throwIfNotOk above ({ error } JSON if parseable, raw body otherwise).
function xhrErrorMessage(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed.error || body;
  } catch {
    return body;
  }
}

/**
 * Authenticated XHR PUT — mirrors authedFetch's contract for chunk payloads:
 * attach the current access token, and on a 401 refresh once (deduped inside
 * tryRefreshToken, so concurrent chunks can't race a rotating refresh token)
 * and retry with the new one. Throws Error(serverMessage) on non-2xx.
 */
async function authedXhrPut(
  url: string,
  headers: Record<string, string>,
  data: Uint8Array,
  onProgress?: (sentBytes: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const { accessToken } = useAuthStore.getState();
  const send = (token: string | null) =>
    xhrPut(url, token ? { ...headers, Authorization: `Bearer ${token}` } : headers, data, onProgress, signal);

  let res = await send(accessToken);
  if (res.status === 401 && accessToken) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      res = await send(newToken);
    }
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(xhrErrorMessage(res.body));
  }
}

export interface UploadInitParams {
  filename: string;
  /** Zero-knowledge file name (base64). When set, filename is sent empty and the
   *  server stores only this opaque value. */
  encrypted_name?: string;
  original_size: number;
  sha256: string;
  /** Content-hash scheme: 'hmac_v1' (per-user keyed MAC) for upgraded clients,
   *  'plain'/omitted = legacy SHA-256 of the plaintext. */
  sha256_scheme?: string;
  salt: string; // base64
  wrapped_cek: string; // base64 envelope-wrapped Content Encryption Key
  chunk_count: number;
  /** Chunk size this client will slice at — stored server-side so a resume from
   *  ANY device can reslice at the same boundaries. */
  chunk_size?: number;
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
  /**
   * true ⇒ the server found an ACTIVE session for this exact file (same
   * sha256 + size) and returned it instead of creating a new one. The client
   * must then adopt that session: unwrap its stored envelope for the CEK and
   * reslice at its chunk_size. This is what pins a resume to the ORIGINAL
   * platform — the server, not localStorage, is the source of truth.
   */
  resumed?: boolean;
  chunk_size?: number;
  chunk_count?: number;
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

/** PUT /api/upload/{sid}/chunk/{idx} — upload a single encrypted chunk.
 *  `onProgress` (optional) receives sent-byte counts as the body streams out,
 *  so the store can show intra-chunk progress instead of a frozen bar. */
export async function uploadChunk(
  sessionId: string,
  index: number,
  encryptedData: Uint8Array,
  sha256: string,
  compressed: boolean,
  onProgress?: (sentBytes: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/octet-stream",
    "X-Chunk-SHA256": sha256,
  };
  if (compressed) {
    headers["X-Chunk-Compressed"] = "true";
  }

  await authedXhrPut(
    `${API_BASE}/api/upload/${sessionId}/chunk/${index}`,
    headers,
    encryptedData,
    onProgress,
    signal
  );
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

/** Upload data directly to a presigned platform URL with retries.
 *  No Authorization header — the presigned URL/headers carry the credentials.
 *  `onProgress` (optional) receives sent-byte counts as the body streams out. */
export async function directUploadToURL(
  url: string,
  headers: Record<string, string> | null,
  data: Uint8Array,
  onProgress?: (sentBytes: number) => void,
  signal?: AbortSignal
): Promise<void> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    // A pause/cancel abort must stop the internal retry loop immediately —
    // never re-send a chunk the user just paused.
    if (signal?.aborted) throw new Error("Upload paused");
    try {
      const res = await xhrPut(
        url,
        {
          "Content-Type": "application/octet-stream",
          ...(headers || {}),
        },
        data,
        onProgress,
        signal
      );
      if (res.status >= 200 && res.status < 300) return;
      lastError = new Error(`Direct upload failed: ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.message === "Upload paused") throw lastError;
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
  /** Original chunk size + platform of this session (server-stored), so any
   *  device can resume with the right slicing on the right platform. */
  chunk_size?: number;
  platform?: string;
}

/** GET /api/upload/{sid}/status — check upload session progress. */
export async function getUploadStatus(sessionId: string): Promise<UploadStatusResponse> {
  const res = await authedFetch(`${API_BASE}/api/upload/${sessionId}/status`);
  return handleResponse<UploadStatusResponse>(res);
}
