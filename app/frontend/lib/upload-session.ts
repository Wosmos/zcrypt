/**
 * Upload session API: thin wrappers for the chunked upload endpoints.
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

import { authedFetch, shouldRefreshOn401, tryRefreshToken } from "@/lib/auth-fetch";
import { ApiError, parseErrorBody, retryAfterSeconds, throwResponseError } from "@/lib/http-error";
import { retryTransient } from "@/lib/retry";
import { IDLE_TIMEOUT_MS, PausedError, StalledError, withControlTimeout } from "@/lib/transport";
import { useAuthStore } from "@/store/auth";
import { API_BASE } from "@/lib/config";
import { webTransferLimitFrom } from "@/lib/web-transfer-limit";
import type { UploadMode } from "@/types";

// Every HTTP failure is thrown as an ApiError carrying its status, so the retry
// layer decides by status code (408/429/5xx) rather than by message text.
async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) await throwResponseError(res);
  return res.json() as Promise<T>;
}

async function throwIfNotOk(res: Response): Promise<void> {
  if (!res.ok) await throwResponseError(res);
}

// Minimal XHR result: enough to reproduce the fetch error-handling shape
// (status check + server-message extraction) without touching Response.
export interface XhrResult {
  status: number;
  body: string;
  retryAfter: number;
}

/**
 * PUT `data` to `url` via XMLHttpRequest, reporting upload progress.
 *
 * Rejects only on transport-level failures (network error / abort / timeout),
 * matching fetch semantics; HTTP error statuses resolve normally and are
 * handled by the caller. `onProgress` receives the number of BODY bytes the
 * browser has sent so far (monotonic within one attempt).
 */
export function xhrPut(
  url: string,
  headers: Record<string, string>,
  data: Uint8Array,
  onProgress?: (sentBytes: number) => void,
  signal?: AbortSignal,
): Promise<XhrResult> {
  // Stall watchdog. A fixed xhr.timeout would false-abort a large chunk on a
  // slow-but-progressing link, and NOT setting one (the old bug) let a dead
  // socket hang the promise forever: stalling the whole upload at ~95% with no
  // error. Instead we abort only when NO progress happens for STALL_MS: reset
  // the clock on every upload-progress tick, and again once the body is sent
  // (so a server that never responds is caught too). An abort rejects, so the
  // caller's retry can re-send the chunk.
  //
  // `signal` is the caller's pause/cancel abort: it kills the transfer
  // immediately and rejects with a PausedError the retry layer treats as a
  // stop, never as a transient error to retry.
  return new Promise<XhrResult>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PausedError());
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
      try {
        xhr.abort();
      } catch {
        /* already settled */
      }
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
        try {
          xhr.abort();
        } catch {
          /* already settled */
        }
      }, IDLE_TIMEOUT_MS);
    };
    // Always track upload progress for the watchdog; forward to the caller too.
    xhr.upload.onprogress = (e: ProgressEvent) => {
      armStall();
      onProgress?.(e.loaded);
    };
    xhr.upload.onload = () => armStall(); // body sent: now watch for the response
    xhr.onload = () => {
      clearStall();
      resolve({
        status: xhr.status,
        body: xhr.responseText,
        retryAfter: retryAfterSeconds(xhr.getResponseHeader("Retry-After")),
      });
    };
    xhr.onerror = () => {
      clearStall();
      reject(new TypeError("Network request failed"));
    };
    xhr.onabort = () => {
      clearStall();
      reject(
        externallyAborted
          ? new PausedError()
          : stalled
            ? new StalledError("Upload stalled (no progress for 60s)")
            : new TypeError("Upload aborted"),
      );
    };
    xhr.ontimeout = () => {
      clearStall();
      reject(new StalledError("Upload timed out"));
    };
    armStall(); // start the clock before the first byte
    xhr.send(data as unknown as XMLHttpRequestBodyInit);
  });
}

/**
 * Authenticated XHR PUT: mirrors authedFetch's contract for chunk payloads:
 * attach the current access token, and on a 401 refresh once (deduped inside
 * tryRefreshToken, so concurrent chunks can't race a rotating refresh token)
 * and retry with the new one. Throws ApiError(serverMessage, status) on non-2xx.
 */
async function authedXhrPut(
  url: string,
  headers: Record<string, string>,
  data: Uint8Array,
  onProgress?: (sentBytes: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { accessToken } = useAuthStore.getState();
  const send = (token: string | null) =>
    xhrPut(
      url,
      token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
      data,
      onProgress,
      signal,
    );

  let res = await send(accessToken);
  if (res.status === 401 && shouldRefreshOn401(accessToken)) {
    const newToken = await tryRefreshToken();
    if (newToken) {
      res = await send(newToken);
    }
  }
  if (res.status < 200 || res.status >= 300) {
    throw new ApiError(parseErrorBody(res.body), res.status, res.retryAfter);
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
  /** Chunk size this client will slice at: stored server-side so a resume from
   *  ANY device can reslice at the same boundaries. */
  chunk_size?: number;
  platform?: string;
  /** Data plane: omitted or "relay" sends bytes through the server; "byos-direct"
   *  opens a metadata-only session the client pushes to its own storage for. */
  mode?: UploadMode;
  /**
   * Destination folder (FIX-1b). When set, the backend creates the file row IN
   * this folder atomically at init: so a protected-folder file is born in its
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
   * platform: the server, not localStorage, is the source of truth.
   */
  resumed?: boolean;
  chunk_size?: number;
  chunk_count?: number;
  /** The session's data plane. A resumed session keeps the mode it was opened with. */
  mode?: UploadMode;
}

/** POST /api/upload/init. Start a new chunked upload session. A web upload the
 *  server refuses for its size or the monthly allowance throws a WebTransferLimitError. */
export function initUpload(
  params: UploadInitParams,
  signal?: AbortSignal,
): Promise<UploadInitResponse> {
  return withControlTimeout(async (s) => {
    const res = await authedFetch(`${API_BASE}/api/upload/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: s,
    });
    if (!res.ok) {
      const body = await res.text();
      throw (
        webTransferLimitFrom(body, res.status) ??
        new ApiError(
          parseErrorBody(body),
          res.status,
          retryAfterSeconds(res.headers?.get?.("Retry-After")),
        )
      );
    }
    return res.json() as Promise<UploadInitResponse>;
  }, signal);
}

/** PUT /api/upload/{sid}/chunk/{idx}: upload a single encrypted chunk.
 *  `onProgress` (optional) receives sent-byte counts as the body streams out,
 *  so the store can show intra-chunk progress instead of a frozen bar. */
export async function uploadChunk(
  sessionId: string,
  index: number,
  encryptedData: Uint8Array,
  sha256: string,
  compressed: boolean,
  onProgress?: (sentBytes: number) => void,
  signal?: AbortSignal,
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
    signal,
  );
}

export interface PresignResponse {
  upload_url: string;
  upload_headers: Record<string, string> | null;
  remote_path: string;
  already_exists: boolean;
}

/** POST /api/upload/{sid}/presign/{idx}: get a presigned URL for direct upload. */
export function presignChunk(
  sessionId: string,
  index: number,
  sha256: string,
  size: number,
  signal?: AbortSignal,
): Promise<PresignResponse> {
  return withControlTimeout(
    async (s) =>
      handleResponse<PresignResponse>(
        await authedFetch(`${API_BASE}/api/upload/${sessionId}/presign/${index}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sha256, size }),
          signal: s,
        }),
      ),
    signal,
  );
}

/** A presigned upload target: the URL plus the headers that carry its credentials. */
export interface PresignedTarget {
  url: string;
  headers: Record<string, string> | null;
}

/** Upload data directly to a presigned platform URL, retrying transient failures.
 *  No Authorization header: the presigned URL/headers carry the credentials.
 *  A 403 means the URL expired: `refresh` (when given) mints a new one and the
 *  chunk is re-sent once to it. `onProgress` receives sent-byte counts. */
export async function directUploadToURL(
  url: string,
  headers: Record<string, string> | null,
  data: Uint8Array,
  onProgress?: (sentBytes: number) => void,
  signal?: AbortSignal,
  refresh?: () => Promise<PresignedTarget>,
): Promise<void> {
  let target: PresignedTarget = { url, headers };
  let refreshed = false;
  const put = async () => {
    const res = await xhrPut(
      target.url,
      { "Content-Type": "application/octet-stream", ...(target.headers || {}) },
      data,
      onProgress,
      signal,
    );
    if (res.status >= 200 && res.status < 300) return;
    throw new ApiError(`Direct upload failed: ${res.status}`, res.status, res.retryAfter);
  };
  await retryTransient(
    async () => {
      try {
        await put();
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 403 || !refresh || refreshed) throw err;
        refreshed = true;
        target = await refresh();
        await put();
      }
    },
    { signal, stopError: () => new PausedError(), maxRetries: 2 },
  );
}

/** Where a byos-direct chunk was pushed: the user's own platform account and repo. */
export interface DirectChunkPlacement {
  platform: string;
  account: string;
  repo_id: string;
}

/** POST /api/upload/{sid}/confirm/{idx}, confirm a directly-uploaded chunk.
 *  `placement` marks a byos-direct chunk, already stored on the user's own
 *  platform, so it is confirmed as committed there. */
export function confirmChunk(
  sessionId: string,
  index: number,
  sha256: string,
  size: number,
  remotePath: string,
  compressed: boolean,
  placement?: DirectChunkPlacement,
  signal?: AbortSignal,
): Promise<void> {
  return withControlTimeout(
    async (s) =>
      throwIfNotOk(
        await authedFetch(`${API_BASE}/api/upload/${sessionId}/confirm/${index}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sha256,
            size,
            remote_path: remotePath,
            compressed,
            ...(placement ? { ...placement, committed: true } : {}),
          }),
          signal: s,
        }),
      ),
    signal,
  );
}

export interface UploadCompleteResponse {
  file_id: string;
}

/** POST /api/upload/{sid}/complete, finalize the upload session. */
export function completeUpload(
  sessionId: string,
  encryptedSize: number,
  compressedSize: number,
  signal?: AbortSignal,
): Promise<UploadCompleteResponse> {
  return withControlTimeout(
    async (s) =>
      handleResponse<UploadCompleteResponse>(
        await authedFetch(`${API_BASE}/api/upload/${sessionId}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ encrypted_size: encryptedSize, compressed_size: compressedSize }),
          signal: s,
        }),
      ),
    signal,
  );
}

/** DELETE /api/upload/{sid}, cancel an upload session. */
export function cancelUpload(sessionId: string): Promise<void> {
  return withControlTimeout(async (s) => {
    const res = await authedFetch(`${API_BASE}/api/upload/${sessionId}`, {
      method: "DELETE",
      signal: s,
    });
    if (!res.ok) throw new ApiError(await res.text(), res.status);
  });
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
  mode?: UploadMode;
}

/** GET /api/upload/{sid}/status. Check upload session progress. */
export function getUploadStatus(
  sessionId: string,
  signal?: AbortSignal,
): Promise<UploadStatusResponse> {
  return withControlTimeout(
    async (s) =>
      handleResponse<UploadStatusResponse>(
        await authedFetch(`${API_BASE}/api/upload/${sessionId}/status`, { signal: s }),
      ),
    signal,
  );
}
