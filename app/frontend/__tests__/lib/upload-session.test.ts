import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// vi.mock is hoisted above module init, so the mock fns must come from
// vi.hoisted() to exist when the factories run. Plain-JSON endpoints
// (initUpload/presignChunk/confirmChunk/completeUpload/cancelUpload/
// getUploadStatus) call authedFetch directly, so we mock it directly rather
// than mocking global fetch underneath it. The XHR-backed chunk PUTs
// (uploadChunk/directUploadToURL) go through useAuthStore + tryRefreshToken
// for their own 401-refresh-retry logic.
const { authedFetch, tryRefreshToken, getState } = vi.hoisted(() => ({
  authedFetch: vi.fn(),
  tryRefreshToken: vi.fn(),
  getState: vi.fn(),
}));
vi.mock("@/lib/auth-fetch", () => ({ authedFetch, tryRefreshToken }));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState } }));

import {
  initUpload,
  uploadChunk,
  presignChunk,
  directUploadToURL,
  confirmChunk,
  completeUpload,
  cancelUpload,
  getUploadStatus,
  type UploadInitParams,
} from "@/lib/upload-session";

function resp(status: number, body: unknown): Response {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => text,
    json: async () => (typeof body === "string" ? JSON.parse(text) : body),
  } as Response;
}

type ProgressHandler = ((e: ProgressEvent) => void) | null;

/** A fully-controlled XMLHttpRequest stand-in: constructor, open/setRequestHeader/
 *  send/abort, plus the event hooks upload-session.ts actually wires up. Tests
 *  drive it by grabbing the latest instance and invoking its handlers directly. */
class FakeXHR {
  static instances: FakeXHR[] = [];
  method = "";
  url = "";
  readonly headers: Record<string, string> = {};
  status = 0;
  responseText = "";
  sentBody: unknown = null;
  abortCalled = false;
  upload: { onprogress: ProgressHandler; onload: (() => void) | null } = {
    onprogress: null,
    onload: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;

  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(key: string, value: string) {
    this.headers[key] = value;
  }
  send(body: unknown) {
    this.sentBody = body;
  }
  abort() {
    this.abortCalled = true;
    this.onabort?.();
  }
}

function lastXHR(): FakeXHR {
  const instance = FakeXHR.instances[FakeXHR.instances.length - 1];
  if (!instance) throw new Error("no XHR created");
  return instance;
}

async function flushMicrotasks(times = 5) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  FakeXHR.instances = [];
  getState.mockReturnValue({ accessToken: "access-tok" });
  vi.stubGlobal("XMLHttpRequest", FakeXHR as unknown as typeof XMLHttpRequest);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("plain JSON endpoints (authedFetch-backed)", () => {
  const initParams: UploadInitParams = {
    filename: "a.txt",
    original_size: 10,
    sha256: "abc",
    salt: "c2FsdA==",
    wrapped_cek: "d2NlaQ==",
    chunk_count: 1,
  };

  it("initUpload posts params and returns the parsed response", async () => {
    authedFetch.mockResolvedValueOnce(
      resp(200, { session_id: "s1", file_id: "f1", platform: "github", direct_upload: false })
    );
    const result = await initUpload(initParams);
    expect(result).toEqual({ session_id: "s1", file_id: "f1", platform: "github", direct_upload: false });
    const [url, init] = authedFetch.mock.calls[0];
    expect(String(url)).toContain("/api/upload/init");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual(initParams);
  });

  it("initUpload surfaces resumed/chunk_size/platform passthrough fields", async () => {
    authedFetch.mockResolvedValueOnce(
      resp(200, {
        session_id: "s1",
        file_id: "f1",
        platform: "telegram",
        direct_upload: true,
        resumed: true,
        chunk_size: 4194304,
        chunk_count: 3,
      })
    );
    const result = await initUpload({ ...initParams, chunk_count: 3 });
    expect(result.resumed).toBe(true);
    expect(result.chunk_size).toBe(4194304);
    expect(result.chunk_count).toBe(3);
  });

  it("initUpload throws the parsed {error} message on a non-ok JSON body", async () => {
    authedFetch.mockResolvedValueOnce(resp(409, { error: "duplicate upload" }));
    await expect(initUpload(initParams)).rejects.toThrow("duplicate upload");
  });

  it("initUpload throws the raw body when the error response isn't JSON", async () => {
    authedFetch.mockResolvedValueOnce(resp(500, "server exploded"));
    await expect(initUpload(initParams)).rejects.toThrow("server exploded");
  });

  it("initUpload falls back to the raw body when the JSON error has no truthy 'error' field", async () => {
    authedFetch.mockResolvedValueOnce(resp(400, {}));
    await expect(initUpload(initParams)).rejects.toThrow("{}");
  });

  it("presignChunk posts sha256/size and returns the presign response", async () => {
    authedFetch.mockResolvedValueOnce(
      resp(200, { upload_url: "https://x/y", upload_headers: { "X-Auth": "t" }, remote_path: "p", already_exists: false })
    );
    const result = await presignChunk("sess-1", 2, "sha", 100);
    expect(result.upload_url).toBe("https://x/y");
    const [url, init] = authedFetch.mock.calls[0];
    expect(String(url)).toContain("/api/upload/sess-1/presign/2");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ sha256: "sha", size: 100 });
  });

  it("confirmChunk posts the chunk metadata and resolves on success", async () => {
    authedFetch.mockResolvedValueOnce(resp(200, {}));
    await confirmChunk("sess-1", 3, "sha", 50, "remote/path", true);
    const [url, init] = authedFetch.mock.calls[0];
    expect(String(url)).toContain("/api/upload/sess-1/confirm/3");
    expect(JSON.parse(init.body as string)).toEqual({
      sha256: "sha",
      size: 50,
      remote_path: "remote/path",
      compressed: true,
    });
  });

  it("confirmChunk throws the parsed {error} message on failure", async () => {
    authedFetch.mockResolvedValueOnce(resp(400, { error: "bad chunk" }));
    await expect(confirmChunk("sess-1", 0, "sha", 1, "p", false)).rejects.toThrow("bad chunk");
  });

  it("confirmChunk throws the raw body when the error response isn't JSON", async () => {
    authedFetch.mockResolvedValueOnce(resp(500, "gateway timeout"));
    await expect(confirmChunk("sess-1", 0, "sha", 1, "p", false)).rejects.toThrow("gateway timeout");
  });

  it("confirmChunk falls back to the raw body when the JSON error has no truthy 'error' field", async () => {
    authedFetch.mockResolvedValueOnce(resp(400, { code: 7 }));
    await expect(confirmChunk("sess-1", 0, "sha", 1, "p", false)).rejects.toThrow('{"code":7}');
  });

  it("completeUpload posts sizes and returns the file_id", async () => {
    authedFetch.mockResolvedValueOnce(resp(200, { file_id: "f9" }));
    const result = await completeUpload("sess-1", 1000, 800);
    expect(result).toEqual({ file_id: "f9" });
    const [url, init] = authedFetch.mock.calls[0];
    expect(String(url)).toContain("/api/upload/sess-1/complete");
    expect(JSON.parse(init.body as string)).toEqual({ encrypted_size: 1000, compressed_size: 800 });
  });

  it("cancelUpload sends a DELETE and resolves on success", async () => {
    authedFetch.mockResolvedValueOnce(resp(204, ""));
    await cancelUpload("sess-1");
    const [url, init] = authedFetch.mock.calls[0];
    expect(String(url)).toContain("/api/upload/sess-1");
    expect(init.method).toBe("DELETE");
  });

  it("cancelUpload throws the RAW body verbatim, unlike the JSON-parsing helpers", async () => {
    authedFetch.mockResolvedValueOnce(resp(400, { error: "cannot cancel" }));
    await expect(cancelUpload("sess-1")).rejects.toThrow('{"error":"cannot cancel"}');
  });

  it("getUploadStatus returns status including chunk_size/platform passthrough", async () => {
    authedFetch.mockResolvedValueOnce(
      resp(200, {
        session_id: "s1",
        file_id: "f1",
        status: "active",
        chunk_count: 5,
        uploaded_chunks: [0, 1],
        completed_count: 2,
        chunk_size: 4194304,
        platform: "telegram",
      })
    );
    const result = await getUploadStatus("s1");
    expect(result.chunk_size).toBe(4194304);
    expect(result.platform).toBe("telegram");
    expect(String(authedFetch.mock.calls[0][0])).toContain("/api/upload/s1/status");
  });

  it("getUploadStatus throws the parsed error on failure", async () => {
    authedFetch.mockResolvedValueOnce(resp(404, { error: "session not found" }));
    await expect(getUploadStatus("missing")).rejects.toThrow("session not found");
  });
});

describe("uploadChunk (authedXhrPut over XMLHttpRequest)", () => {
  it("resolves on a successful 2xx PUT and sets the expected headers", async () => {
    const promise = uploadChunk("sess-1", 2, new Uint8Array([1, 2, 3]), "sha-x", true);
    const xhr = lastXHR();
    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toContain("/api/upload/sess-1/chunk/2");
    expect(xhr.headers["Content-Type"]).toBe("application/octet-stream");
    expect(xhr.headers["X-Chunk-SHA256"]).toBe("sha-x");
    expect(xhr.headers["X-Chunk-Compressed"]).toBe("true");
    expect(xhr.headers.Authorization).toBe("Bearer access-tok");

    xhr.status = 200;
    xhr.onload?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it("omits X-Chunk-Compressed when the chunk isn't compressed", async () => {
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const xhr = lastXHR();
    expect(xhr.headers["X-Chunk-Compressed"]).toBeUndefined();
    xhr.status = 200;
    xhr.onload?.();
    await promise;
  });

  it("omits the Authorization header when there is no access token", async () => {
    getState.mockReturnValue({ accessToken: null });
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const xhr = lastXHR();
    expect(xhr.headers.Authorization).toBeUndefined();
    xhr.status = 200;
    xhr.onload?.();
    await promise;
  });

  it("forwards cumulative sent-byte progress to onProgress", async () => {
    const onProgress = vi.fn();
    const promise = uploadChunk("sess-1", 0, new Uint8Array(10), "sha", false, onProgress);
    const xhr = lastXHR();
    xhr.upload.onprogress?.({ loaded: 4 } as ProgressEvent);
    xhr.upload.onprogress?.({ loaded: 10 } as ProgressEvent);
    expect(onProgress).toHaveBeenNthCalledWith(1, 4);
    expect(onProgress).toHaveBeenNthCalledWith(2, 10);
    xhr.status = 200;
    xhr.onload?.();
    await promise;
  });

  it("on 401, refreshes the token and retries with the new one", async () => {
    tryRefreshToken.mockResolvedValueOnce("fresh-tok");
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const first = lastXHR();
    first.status = 401;
    first.onload?.();

    await flushMicrotasks();

    expect(FakeXHR.instances.length).toBe(2);
    const second = lastXHR();
    expect(second.headers.Authorization).toBe("Bearer fresh-tok");
    second.status = 200;
    second.onload?.();

    await expect(promise).resolves.toBeUndefined();
    expect(tryRefreshToken).toHaveBeenCalledTimes(1);
  });

  it("gives up after a 401 when the refresh fails, without retrying", async () => {
    tryRefreshToken.mockResolvedValueOnce(null);
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const first = lastXHR();
    first.status = 401;
    first.responseText = JSON.stringify({ error: "expired" });
    first.onload?.();

    await expect(promise).rejects.toThrow("expired");
    expect(FakeXHR.instances.length).toBe(1);
  });

  it("does not attempt a refresh on 401 when there was no access token to begin with", async () => {
    getState.mockReturnValue({ accessToken: null });
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const first = lastXHR();
    first.status = 401;
    first.responseText = "unauthorized";
    first.onload?.();

    await expect(promise).rejects.toThrow("unauthorized");
    expect(tryRefreshToken).not.toHaveBeenCalled();
    expect(FakeXHR.instances.length).toBe(1);
  });

  it("throws the parsed {error} message on a non-2xx JSON body", async () => {
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const xhr = lastXHR();
    xhr.status = 400;
    xhr.responseText = JSON.stringify({ error: "bad chunk" });
    xhr.onload?.();
    await expect(promise).rejects.toThrow("bad chunk");
  });

  it("throws the raw body when a non-2xx response isn't JSON", async () => {
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const xhr = lastXHR();
    xhr.status = 502;
    xhr.responseText = "bad gateway html";
    xhr.onload?.();
    await expect(promise).rejects.toThrow("bad gateway html");
  });

  it("falls back to the raw XHR body when the JSON error has no truthy 'error' field", async () => {
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const xhr = lastXHR();
    xhr.status = 400;
    xhr.responseText = JSON.stringify({});
    xhr.onload?.();
    await expect(promise).rejects.toThrow("{}");
  });

  it("rejects with a TypeError on a network error", async () => {
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const xhr = lastXHR();
    xhr.onerror?.();
    await expect(promise).rejects.toThrow("Network request failed");
  });

  it("rejects with 'Upload timed out' if the transport itself times out", async () => {
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const xhr = lastXHR();
    xhr.ontimeout?.();
    await expect(promise).rejects.toThrow("Upload timed out");
  });

  it("rejects with 'Upload paused' when the signal is already aborted before the send", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false, undefined, controller.signal)
    ).rejects.toThrow("Upload paused");
    expect(FakeXHR.instances.length).toBe(0);
  });

  it("rejects with exactly 'Upload paused' when the signal aborts mid-flight", async () => {
    const controller = new AbortController();
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false, undefined, controller.signal);
    const xhr = lastXHR();
    controller.abort();
    expect(xhr.abortCalled).toBe(true);
    await expect(promise).rejects.toThrow("Upload paused");
  });

  it("swallows a throwing xhr.abort() when the signal fires after the transfer already settled", async () => {
    const controller = new AbortController();
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false, undefined, controller.signal);
    const xhr = lastXHR();
    xhr.abort = () => {
      throw new Error("InvalidStateError");
    };
    controller.abort();
    xhr.status = 200;
    xhr.onload?.();
    await expect(promise).resolves.toBeUndefined();
  });

  it("rejects with the stall message after 60s of no upload progress", async () => {
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    // Attach a throwaway consumer synchronously: the actual rejection happens
    // mid-await inside advanceTimersByTimeAsync below, and Node flags a promise
    // as "unhandled" if nothing is listening at that point in the microtask
    // queue — even though the `rejects.toThrow` consumer is attached moments
    // later in this same test.
    promise.catch(() => {});
    const xhr = lastXHR();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(xhr.abortCalled).toBe(true);
    await expect(promise).rejects.toThrow("Upload stalled (no progress for 60s)");
  });

  it("swallows a throwing xhr.abort() from the stall watchdog", async () => {
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const xhr = lastXHR();
    xhr.abort = () => {
      throw new Error("InvalidStateError");
    };
    await vi.advanceTimersByTimeAsync(60_000);
    xhr.status = 200;
    xhr.onload?.();
    await expect(promise).resolves.toBeUndefined();
  });

  it("progress resets the stall clock so a slow-but-live transfer doesn't false-abort", async () => {
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const xhr = lastXHR();
    await vi.advanceTimersByTimeAsync(50_000);
    xhr.upload.onprogress?.({ loaded: 1 } as ProgressEvent);
    await vi.advanceTimersByTimeAsync(50_000);
    expect(xhr.abortCalled).toBe(false);
    xhr.status = 200;
    xhr.onload?.();
    await expect(promise).resolves.toBeUndefined();
  });

  it("re-arms the stall watchdog once the body finishes sending (upload.onload)", async () => {
    const promise = uploadChunk("sess-1", 0, new Uint8Array([1]), "sha", false);
    const xhr = lastXHR();
    await vi.advanceTimersByTimeAsync(50_000);
    xhr.upload.onload?.();
    await vi.advanceTimersByTimeAsync(59_000);
    expect(xhr.abortCalled).toBe(false);
    xhr.status = 200;
    xhr.onload?.();
    await expect(promise).resolves.toBeUndefined();
  });
});

describe("directUploadToURL (unauthenticated XHR PUT with its own 3-attempt retry)", () => {
  it("resolves immediately on a successful first attempt, with no Authorization header", async () => {
    const onProgress = vi.fn();
    const promise = directUploadToURL(
      "https://cdn.example/upload",
      { "X-Custom": "v" },
      new Uint8Array([9, 9]),
      onProgress
    );
    const xhr = lastXHR();
    expect(xhr.headers["Content-Type"]).toBe("application/octet-stream");
    expect(xhr.headers["X-Custom"]).toBe("v");
    expect(xhr.headers.Authorization).toBeUndefined();

    xhr.upload.onprogress?.({ loaded: 2 } as ProgressEvent);
    xhr.status = 204;
    xhr.onload?.();

    await expect(promise).resolves.toBeUndefined();
    expect(onProgress).toHaveBeenCalledWith(2);
    expect(FakeXHR.instances.length).toBe(1);
  });

  it("works with null headers (the presigned URL carries its own auth)", async () => {
    const promise = directUploadToURL("https://cdn.example/upload", null, new Uint8Array([1]));
    const xhr = lastXHR();
    expect(Object.keys(xhr.headers)).toEqual(["Content-Type"]);
    xhr.status = 200;
    xhr.onload?.();
    await promise;
  });

  it("retries a failing status and succeeds on the second attempt", async () => {
    const promise = directUploadToURL("https://cdn.example/upload", null, new Uint8Array([1]));
    const first = lastXHR();
    first.status = 500;
    first.onload?.();

    await vi.advanceTimersByTimeAsync(1000);

    expect(FakeXHR.instances.length).toBe(2);
    const second = lastXHR();
    second.status = 200;
    second.onload?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it("retries a network error and succeeds on the second attempt", async () => {
    const promise = directUploadToURL("https://cdn.example/upload", null, new Uint8Array([1]));
    const first = lastXHR();
    first.onerror?.();

    await vi.advanceTimersByTimeAsync(1000);

    const second = lastXHR();
    second.status = 200;
    second.onload?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it("throws the last failure after exhausting all 3 attempts", async () => {
    const promise = directUploadToURL("https://cdn.example/upload", null, new Uint8Array([1]));
    promise.catch(() => {}); // see comment on the stall-abort test above

    let xhr = lastXHR();
    xhr.status = 400;
    xhr.onload?.();
    await vi.advanceTimersByTimeAsync(1000);

    xhr = lastXHR();
    xhr.status = 400;
    xhr.onload?.();
    await vi.advanceTimersByTimeAsync(2000);

    xhr = lastXHR();
    xhr.status = 400;
    xhr.onload?.();
    await vi.advanceTimersByTimeAsync(3000);

    await expect(promise).rejects.toThrow("Direct upload failed: 400");
    expect(FakeXHR.instances.length).toBe(3);
  });

  it("throws immediately with 'Upload paused' if the signal is already aborted, before any XHR", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      directUploadToURL("https://cdn.example/upload", null, new Uint8Array([1]), undefined, controller.signal)
    ).rejects.toThrow("Upload paused");
    expect(FakeXHR.instances.length).toBe(0);
  });

  it("stops the retry loop immediately on a mid-flight pause, without a second attempt", async () => {
    const controller = new AbortController();
    const promise = directUploadToURL(
      "https://cdn.example/upload",
      null,
      new Uint8Array([1]),
      undefined,
      controller.signal
    );
    controller.abort();

    await expect(promise).rejects.toThrow("Upload paused");
    expect(FakeXHR.instances.length).toBe(1);
  });

  it("also refuses to start a new attempt if paused during the inter-attempt backoff delay", async () => {
    const controller = new AbortController();
    const promise = directUploadToURL(
      "https://cdn.example/upload",
      null,
      new Uint8Array([1]),
      undefined,
      controller.signal
    );
    promise.catch(() => {}); // see comment on the stall-abort test above
    const first = lastXHR();
    first.status = 500;
    first.onload?.();

    controller.abort();
    await vi.advanceTimersByTimeAsync(1000);

    await expect(promise).rejects.toThrow("Upload paused");
    expect(FakeXHR.instances.length).toBe(1);
  });

  it("retries past a stall abort (not treated as a pause)", async () => {
    const promise = directUploadToURL("https://cdn.example/upload", null, new Uint8Array([1]));
    const first = lastXHR();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(first.abortCalled).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);

    const second = lastXHR();
    second.status = 200;
    second.onload?.();

    await expect(promise).resolves.toBeUndefined();
  });

  it("normalizes a non-Error rejection reason into an Error", async () => {
    // A Promise executor that throws synchronously rejects with whatever was
    // thrown, not necessarily an Error — e.g. a pre-flight XHR construction
    // failure in some exotic environment. The retry loop's catch block must
    // coerce that into an Error rather than propagating a bare string.
    const originalOpen = FakeXHR.prototype.open;
    FakeXHR.prototype.open = () => {
      throw "boom";
    };
    try {
      const promise = directUploadToURL("https://cdn.example/upload", null, new Uint8Array([1]));
      promise.catch(() => {});
      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(2000);
      await vi.advanceTimersByTimeAsync(3000);
      await expect(promise).rejects.toThrow("boom");
    } finally {
      FakeXHR.prototype.open = originalOpen;
    }
  });

  it("surfaces 'Upload aborted' when the transport aborts for neither a stall nor an external signal", async () => {
    const promise = directUploadToURL("https://cdn.example/upload", null, new Uint8Array([1]));
    promise.catch(() => {}); // see comment on the stall-abort test above

    let xhr = lastXHR();
    xhr.status = 400;
    xhr.onload?.();
    await vi.advanceTimersByTimeAsync(1000);

    xhr = lastXHR();
    xhr.status = 400;
    xhr.onload?.();
    await vi.advanceTimersByTimeAsync(2000);

    xhr = lastXHR();
    xhr.onabort?.(); // raw abort event, neither externallyAborted nor stalled set
    await vi.advanceTimersByTimeAsync(3000);

    await expect(promise).rejects.toThrow("Upload aborted");
  });
});
