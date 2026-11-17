import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { getState, authedFetch } = vi.hoisted(() => {
  const getState = vi.fn(() => ({ accessToken: "tok" as string | null }));
  const authedFetch = vi.fn(async (input: string, init?: RequestInit) =>
    fetch(input, { ...init, headers: { ...(init?.headers as object), Authorization: "Bearer tok" } }),
  );
  return { getState, authedFetch };
});
vi.mock("@/store/auth", () => ({ useAuthStore: { getState } }));
vi.mock("@/lib/auth-fetch", () => ({
  tryRefreshToken: vi.fn(async () => null),
  shouldRefreshOn401: vi.fn(() => false),
  authedFetch,
}));

import * as api from "@/lib/api";
import { StalledError } from "@/lib/transport";

function res(status: number, body = "", headers: Record<string, string> = {}): Response {
  return new Response(body || (status < 300 ? "x" : JSON.stringify({ error: "nope" })), {
    status,
    headers,
  });
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function settle<T>(p: Promise<T>): Promise<PromiseSettledResult<T>> {
  const out = Promise.allSettled([p]).then((r) => r[0]);
  await vi.runAllTimersAsync();
  return out;
}

const chunkCalls: [string, () => Promise<unknown>][] = [
  ["share", () => api.getShareChunk("tok", 0, undefined, "ticket")],
  ["folder share", () => api.getFolderShareChunk("tok", "f1", 0, undefined, "ticket")],
  ["send", () => api.getSendChunk("tok", 0)],
];

describe.each(chunkCalls)("%s chunk download", (_name, call) => {
  it("retries a 503 through the shared helper and then succeeds", async () => {
    fetchMock.mockResolvedValueOnce(res(503)).mockResolvedValue(res(200, "bytes"));
    const r = await settle(retryWrap(call));
    expect(r.status).toBe("fulfilled");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws an ApiError carrying the status for a 403", async () => {
    fetchMock.mockResolvedValue(res(403));
    const r = await settle(call());
    expect(r).toMatchObject({ status: "rejected", reason: { name: "ApiError", status: 403 } });
  });

  it("carries Retry-After on a 429 so the retry helper can wait it out", async () => {
    fetchMock.mockResolvedValue(res(429, "", { "Retry-After": "7" }));
    const r = await settle(call());
    expect(r).toMatchObject({ status: "rejected", reason: { status: 429, retryAfter: 7 } });
  });

  it("aborts a body that stops moving for 60s with a StalledError", async () => {
    fetchMock.mockImplementation((_u: string, init: RequestInit) => {
      const body = new ReadableStream({
        start(c) {
          init.signal?.addEventListener("abort", () =>
            c.error(new DOMException("aborted", "AbortError")),
          );
        },
      });
      return Promise.resolve(new Response(body, { status: 200 }));
    });
    const r = await settle(call());
    expect(r).toMatchObject({ status: "rejected" });
    expect((r as PromiseRejectedResult).reason).toBeInstanceOf(StalledError);
  });

  it("a caller abort cancels the in-flight request as an AbortError", async () => {
    const ctl = new AbortController();
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_r, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    const callWithSignal: Record<string, () => Promise<unknown>> = {
      share: () => api.getShareChunk("tok", 0, undefined, "t", ctl.signal),
      "folder share": () => api.getFolderShareChunk("tok", "f1", 0, undefined, "t", ctl.signal),
      send: () => api.getSendChunk("tok", 0, ctl.signal),
    };
    const p = callWithSignal[_name]();
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });
});

import { retryTransient } from "@/lib/retry";
function retryWrap(call: () => Promise<unknown>) {
  return retryTransient(call);
}

describe("link confirm and meta", () => {
  it("retries a failed completion confirm instead of dropping it", async () => {
    fetchMock.mockResolvedValueOnce(res(503)).mockResolvedValue(res(200, "{}"));
    const r = await settle(api.completeShareDownload("tok", "ticket"));
    expect(r.status).toBe("fulfilled");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("folder confirm retries too and gives up on a 403", async () => {
    fetchMock.mockResolvedValue(res(403));
    const r = await settle(api.completeFolderShareDownload("tok", "f1", "ticket"));
    expect(r).toMatchObject({ status: "rejected", reason: { status: 403 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("file link meta retries a 429 and honors Retry-After", async () => {
    fetchMock
      .mockResolvedValueOnce(res(429, "", { "Retry-After": "2" }))
      .mockResolvedValue(res(200, JSON.stringify({ chunk_count: 1 })));
    const r = await settle(api.getShareFileMeta("tok"));
    expect(r.status).toBe("fulfilled");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("getClipboardContent", () => {
  it("goes through authedFetch with a control timeout", async () => {
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_r, reject) =>
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          ),
        ),
    );
    const p = api.getClipboardContent("c1");
    const assertion = expect(p).rejects.toBeInstanceOf(StalledError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(authedFetch).toHaveBeenCalled();
  });

  it("throws an ApiError on a non-ok answer", async () => {
    fetchMock.mockResolvedValue(res(404));
    await expect(api.getClipboardContent("c1")).rejects.toMatchObject({ status: 404 });
  });
});

describe("request() timeout with a caller signal", () => {
  const hang = (_u: string, init: RequestInit) =>
    new Promise((_r, reject) =>
      init.signal?.addEventListener("abort", () =>
        reject(new DOMException("aborted", "AbortError")),
      ),
    );

  it("still times out at 30s when the caller supplies a signal", async () => {
    fetchMock.mockImplementation(hang);
    const ctl = new AbortController();
    const p = api.apiRequest("/api/x", { signal: ctl.signal });
    const assertion = expect(p).rejects.toBeInstanceOf(StalledError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
  });

  it("a JSON body that stalls after the headers also times out at 30s", async () => {
    const stalled = {
      ok: true,
      status: 200,
      headers: new Headers(),
      body: { cancel: vi.fn(async () => {}) },
      json: () => new Promise(() => {}),
    };
    fetchMock.mockResolvedValue(stalled);
    const p = api.apiRequest("/api/x");
    const assertion = expect(p).rejects.toBeInstanceOf(StalledError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    expect(stalled.body.cancel).toHaveBeenCalled();
  });

  it("the caller's abort still cancels at once as an AbortError", async () => {
    fetchMock.mockImplementation(hang);
    const ctl = new AbortController();
    const p = api.apiRequest("/api/x", { signal: ctl.signal });
    ctl.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
  });

  it("the retry after a 401 refresh is bounded too", async () => {
    const { tryRefreshToken, shouldRefreshOn401 } = await import("@/lib/auth-fetch");
    vi.mocked(shouldRefreshOn401).mockReturnValue(true);
    vi.mocked(tryRefreshToken).mockResolvedValue("new");
    fetchMock.mockResolvedValueOnce(res(401)).mockImplementation(hang);
    const p = api.apiRequest("/api/x");
    const assertion = expect(p).rejects.toBeInstanceOf(StalledError);
    await vi.advanceTimersByTimeAsync(30_000);
    await assertion;
    vi.mocked(shouldRefreshOn401).mockReturnValue(false);
  });
});

class FakeXHR {
  static instances: FakeXHR[] = [];
  status = 0;
  responseText = "";
  upload: { onprogress: ((e: ProgressEvent) => void) | null; onload: (() => void) | null } = {
    onprogress: null,
    onload: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  headers: Record<string, string> = {};
  aborted = false;
  constructor() {
    FakeXHR.instances.push(this);
  }
  open() {}
  setRequestHeader(k: string, v: string) {
    this.headers[k] = v;
  }
  getResponseHeader() {
    return null;
  }
  send() {}
  abort() {
    this.aborted = true;
    this.onabort?.();
  }
  reply(status: number) {
    this.status = status;
    this.onload?.();
  }
}

describe("sendChunkUpload", () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
  });
  const last = () => FakeXHR.instances[FakeXHR.instances.length - 1];
  const upload = (signal?: AbortSignal, onProgress?: (n: number) => void) =>
    api.sendChunkUpload("s", 3, new Uint8Array([1, 2]), "sha", false, { signal, onProgress });

  it("retries a 503 chunk and succeeds on the next attempt", async () => {
    const p = upload();
    last().reply(503);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeXHR.instances).toHaveLength(2);
    last().reply(200);
    await expect(p).resolves.toBeUndefined();
  });

  it("gives up at once on a 403 with an ApiError", async () => {
    const p = upload();
    const assertion = expect(p).rejects.toMatchObject({ name: "ApiError", status: 403 });
    last().reply(403);
    await assertion;
    expect(FakeXHR.instances).toHaveLength(1);
  });

  it("aborts a PUT that makes no progress for 60s and retries it", async () => {
    const p = upload();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeXHR.instances[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(FakeXHR.instances).toHaveLength(2);
    last().reply(200);
    await expect(p).resolves.toBeUndefined();
  });

  it("cancel aborts the in-flight PUT and does not retry", async () => {
    const ctl = new AbortController();
    const p = upload(ctl.signal);
    const assertion = expect(p).rejects.toBeDefined();
    ctl.abort();
    await assertion;
    expect(last().aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeXHR.instances).toHaveLength(1);
  });

  it("reports per-chunk progress", async () => {
    const seen: number[] = [];
    const p = upload(undefined, (n) => seen.push(n));
    last().upload.onprogress?.({ loaded: 1 } as ProgressEvent);
    last().reply(200);
    await p;
    expect(seen).toEqual([1]);
  });
});
