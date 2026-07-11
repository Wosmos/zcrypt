import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, cleanup, act } from "@testing-library/react";
import type { ThumbnailPasswordResolver } from "@/hooks/useThumbnail";

const {
  getFileMetaMock,
  getFileChunkMock,
  resolveFileKeyMock,
  decryptChunkMock,
  getZstdCodecMock,
  isForegroundDecryptActiveMock,
} = vi.hoisted(() => ({
  getFileMetaMock: vi.fn(),
  getFileChunkMock: vi.fn(),
  resolveFileKeyMock: vi.fn(),
  decryptChunkMock: vi.fn(),
  getZstdCodecMock: vi.fn(),
  isForegroundDecryptActiveMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getFileMeta: getFileMetaMock,
  getFileChunk: getFileChunkMock,
}));

vi.mock("@/lib/crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/crypto")>();
  return {
    ...actual,
    resolveFileKey: resolveFileKeyMock,
    decryptChunk: decryptChunkMock,
  };
});

vi.mock("@/lib/zstd", () => ({
  getZstdCodec: getZstdCodecMock,
}));

vi.mock("@/lib/decrypt-cache", () => ({
  isForegroundDecryptActive: isForegroundDecryptActiveMock,
  // useThumbnail registers its clearer here at module load; stub it so the
  // registration call doesn't hit an undefined export.
  onDecryptCacheClear: () => {},
}));

// ── Fake browser media/canvas primitives ────────────────────────────────
// jsdom implements neither image/video decoding nor canvas rendering, so
// useThumbnail's generateThumbnail/generateVideoThumbnail would hang forever
// waiting on events the real DOM never fires. These fakes resolve via a
// native Promise microtask (NOT queueMicrotask/setTimeout) so they behave
// consistently whether or not a test is running with fake timers.
type ImageBehavior = {
  mode: "success" | "error" | "hang";
  width: number;
  height: number;
  // Independent img.width/height fallback (browsers can report 0 intrinsic
  // naturalWidth/Height for some formats while width/height are still set).
  fallbackWidth?: number;
  fallbackHeight?: number;
};
let imageBehavior: ImageBehavior = { mode: "success", width: 800, height: 600 };

class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  width = 0;
  height = 0;
  private _src = "";
  set src(v: string) {
    this._src = v;
    Promise.resolve().then(() => {
      if (imageBehavior.mode === "hang") return;
      if (imageBehavior.mode === "success") {
        this.naturalWidth = imageBehavior.width;
        this.naturalHeight = imageBehavior.height;
        this.width = imageBehavior.fallbackWidth ?? imageBehavior.width;
        this.height = imageBehavior.fallbackHeight ?? imageBehavior.height;
        this.onload?.();
      } else {
        this.onerror?.();
      }
    });
  }
  get src() {
    return this._src;
  }
}

type VideoBehavior = {
  mode: "success" | "error" | "hang";
  width: number;
  height: number;
  seekThrows?: boolean;
  duration?: number;
};
let videoBehavior: VideoBehavior = { mode: "success", width: 640, height: 360 };
let lastFakeVideo: FakeVideo | undefined;

class FakeVideo {
  muted = false;
  playsInline = false;
  preload = "";
  videoWidth = 0;
  videoHeight = 0;
  duration = videoBehavior.duration ?? 2;
  onloadeddata: (() => void) | null = null;
  onseeked: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  private _currentTime = 0;
  set currentTime(t: number) {
    if (videoBehavior.seekThrows) throw new Error("seek not allowed yet");
    this._currentTime = t;
    Promise.resolve().then(() => this.onseeked?.());
  }
  get currentTime() {
    return this._currentTime;
  }
  set src(v: string) {
    this._src = v;
    Promise.resolve().then(() => {
      if (videoBehavior.mode === "hang") return;
      if (videoBehavior.mode === "success") {
        this.videoWidth = videoBehavior.width;
        this.videoHeight = videoBehavior.height;
        this.onloadeddata?.();
      } else {
        this.onerror?.();
      }
    });
  }
  get src() {
    return this._src;
  }
  removeAttribute() {}
  load() {}
}

type CanvasBehavior = {
  ctxAvailable: boolean;
  drawImageThrows: boolean;
  dataUrl: string;
  /** Simulate a raster whose every pixel is fully transparent (e.g. an SVG
   *  Chrome draws as nothing) — generateThumbnail must reject it. */
  blank?: boolean;
};
let canvasBehavior: CanvasBehavior = {
  ctxAvailable: true,
  drawImageThrows: false,
  dataUrl: "data:image/webp;base64,FAKE",
};

function makeFakeCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: () => {
      if (!canvasBehavior.ctxAvailable) return null;
      return {
        drawImage: () => {
          if (canvasBehavior.drawImageThrows) throw new Error("drawImage failed");
        },
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          // RGBA buffer: alpha 0 everywhere when blank, opaque otherwise.
          data: new Uint8ClampedArray(w * h * 4).fill(canvasBehavior.blank ? 0 : 255),
        }),
      };
    },
    toDataURL: () => canvasBehavior.dataUrl,
  } as unknown as HTMLCanvasElement;
}

const originalCreateElement = document.createElement.bind(document);
const originalImage = window.Image;

beforeEach(() => {
  vi.clearAllMocks();
  imageBehavior = { mode: "success", width: 800, height: 600 };
  videoBehavior = { mode: "success", width: 640, height: 360 };
  canvasBehavior = { ctxAvailable: true, drawImageThrows: false, dataUrl: "data:image/webp;base64,FAKE" };
  lastFakeVideo = undefined;

  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag === "canvas") return makeFakeCanvas();
    if (tag === "video") {
      const v = new FakeVideo();
      lastFakeVideo = v;
      return v as unknown as HTMLVideoElement;
    }
    return originalCreateElement(tag);
  }) as typeof document.createElement);

  window.Image = FakeImage as unknown as typeof window.Image;
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = vi.fn();

  isForegroundDecryptActiveMock.mockReturnValue(false);
  resolveFileKeyMock.mockResolvedValue(new ArrayBuffer(32));
  decryptChunkMock.mockResolvedValue(new Uint8Array([1, 2, 3]));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  window.Image = originalImage;
  delete (globalThis as unknown as { indexedDB?: unknown }).indexedDB;
});

function makeMeta(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    original_name: "photo.jpg",
    original_size: 1000,
    compressed_size: 1000,
    encrypted_size: 1028,
    chunk_count: 1,
    sha256: "irrelevant-for-thumbnails",
    salt: btoa("salt-bytes"),
    wrapped_cek: "wrapped==",
    status: "ready",
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

async function loadModule() {
  vi.resetModules();
  return import("@/hooks/useThumbnail");
}

describe("useThumbnail", () => {
  it("skips file types with no thumbnail support (early return)", async () => {
    const { primeThumbnails, useThumbnail, hasCachedThumbnail } = await loadModule();
    act(() => primeThumbnails("vault-pass"));

    const { result } = renderHook(() => useThumbnail("f1", "notes.pdf"));

    expect(result.current.thumbnailUrl).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(hasCachedThumbnail("f1")).toBe(false);
    expect(getFileMetaMock).not.toHaveBeenCalled();
  });

  it("skips files above the size cap", async () => {
    const { primeThumbnails, useThumbnail } = await loadModule();
    act(() => primeThumbnails("vault-pass"));

    const { result } = renderHook(() =>
      useThumbnail("f1", "photo.jpg", 16 * 1024 * 1024)
    );

    expect(result.current.pending).toBe(false);
    expect(getFileMetaMock).not.toHaveBeenCalled();
  });

  it("does not generate anything until primeThumbnails has armed a passphrase", async () => {
    const { useThumbnail } = await loadModule();
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    expect(result.current.pending).toBe(false);
    expect(getFileMetaMock).not.toHaveBeenCalled();
  });

  it("lazily generates an image thumbnail the first time the file renders after unlock", async () => {
    const { primeThumbnails, useThumbnail, hasCachedThumbnail, getCachedThumbnailCount } =
      await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    expect(result.current.pending).toBe(true);
    await waitFor(() => expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE"));

    expect(result.current.loading).toBe(false);
    expect(result.current.pending).toBe(false);
    expect(hasCachedThumbnail("f1")).toBe(true);
    expect(getCachedThumbnailCount()).toBe(1);
    expect(getFileMetaMock).toHaveBeenCalledWith("f1");
    expect(resolveFileKeyMock).toHaveBeenCalledTimes(1);
  });

  it("does not regenerate an already-cached thumbnail on a later mount", async () => {
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const first = renderHook(() => useThumbnail("f1", "photo.jpg"));
    await waitFor(() =>
      expect(first.result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE")
    );
    expect(getFileMetaMock).toHaveBeenCalledTimes(1);
    first.unmount();

    // A brand new hook instance for the same file must read the cache
    // synchronously — no new fetch/decrypt round trip.
    const second = renderHook(() => useThumbnail("f1", "photo.jpg"));
    expect(second.result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE");
    expect(second.result.current.pending).toBe(false);
    expect(getFileMetaMock).toHaveBeenCalledTimes(1);
  });

  it("generates a video thumbnail by seeking into the decoded frame", async () => {
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ original_name: "clip.mp4" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "clip.mp4"));

    await waitFor(() => expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE"));
  });

  it("decompresses a zstd-compressed chunk via the shared codec before rendering", async () => {
    const decompress = vi.fn(() => new Uint8Array([9, 9, 9]));
    getZstdCodecMock.mockResolvedValue({ ZstdStream: { decompress } });
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: true,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await waitFor(() => expect(result.current.thumbnailUrl).not.toBeNull());
    expect(decompress).toHaveBeenCalledTimes(1);
  });

  it("concatenates multiple decrypted chunks into one blob before decoding", async () => {
    let capturedBlob: Blob | undefined;
    URL.createObjectURL = vi.fn((b: Blob) => {
      capturedBlob = b;
      return "blob:mock-url";
    });
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 2 }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });
    decryptChunkMock
      .mockResolvedValueOnce(new Uint8Array([1, 2]))
      .mockResolvedValueOnce(new Uint8Array([3, 4]));

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await waitFor(() => expect(result.current.thumbnailUrl).not.toBeNull());
    expect(capturedBlob).toBeDefined();
    const bytes = new Uint8Array(await capturedBlob!.arrayBuffer());
    expect(Array.from(bytes)).toEqual([1, 2, 3, 4]);
  });

  it("routes a protected file's thumbnail through the resolvePassword callback, using its folder password", async () => {
    const resolver: ThumbnailPasswordResolver = vi.fn(() => "folder-pass");
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass", resolver));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await waitFor(() => expect(result.current.thumbnailUrl).not.toBeNull());
    expect(resolver).toHaveBeenCalledWith("f1");
    expect(resolveFileKeyMock).toHaveBeenCalledWith(
      "folder-pass",
      expect.any(Uint8Array),
      "wrapped=="
    );
  });

  it("skips (never prompts) a file whose protected folder is locked", async () => {
    const resolver: ThumbnailPasswordResolver = vi.fn(() => null);
    const { primeThumbnails, useThumbnail } = await loadModule();

    act(() => primeThumbnails("vault-pass", resolver));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.thumbnailUrl).toBeNull();
    expect(getFileMetaMock).not.toHaveBeenCalled();
  });

  it("retries a transient chunk-fetch failure, then gives up after MAX attempts", async () => {
    vi.useFakeTimers();
    const { primeThumbnails, useThumbnail, hasCachedThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockRejectedValue(new Error("network down"));

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    // First attempt fails — but a chunk-fetch error is TRANSIENT (e.g. a
    // freshly-uploaded chunk still syncing), so the card keeps shimmering and a
    // retry is scheduled rather than immediately falling back to an icon.
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(getFileMetaMock.mock.calls.length).toBe(1);
    expect(result.current.pending).toBe(true);

    // Advance through both backoffs (3s, then 6s) to exhaust all 3 attempts.
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000 + 6_000 + 300); });

    expect(getFileMetaMock.mock.calls.length).toBe(3); // attempted exactly MAX times
    expect(result.current.pending).toBe(false); // gave up → type icon
    expect(result.current.thumbnailUrl).toBeNull();
    expect(hasCachedThumbnail("f1")).toBe(false);
  });

  it("marks a file failed when the image fails to decode", async () => {
    imageBehavior = { mode: "error", width: 0, height: 0 };
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.thumbnailUrl).toBeNull();
  });

  it("marks a file failed when the canvas has no 2D context", async () => {
    canvasBehavior.ctxAvailable = false;
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.thumbnailUrl).toBeNull();
  });

  it("marks a video failed when it reports no dimensions", async () => {
    videoBehavior = { mode: "success", width: 0, height: 0 };
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ original_name: "clip.mp4" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "clip.mp4"));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.thumbnailUrl).toBeNull();
  });

  it("marks a video failed when drawImage throws (unsupported codec/frame)", async () => {
    canvasBehavior.drawImageThrows = true;
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ original_name: "clip.mp4" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "clip.mp4"));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.thumbnailUrl).toBeNull();
  });

  it("marks a video failed when it never decodes (safety-net timeout)", async () => {
    vi.useFakeTimers();
    videoBehavior = { mode: "hang", width: 0, height: 0 };
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ original_name: "clip.mp4" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "clip.mp4"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.thumbnailUrl).toBeNull();
  });

  it("recovers WITHOUT a reload: fails once (chunk not synced), then succeeds on retry", async () => {
    // The reported bug: a just-uploaded file's chunk is still syncing when the
    // thumbnail first tries to fetch it, so attempt 1 fails — previously that
    // blacklisted the file until a full page reload. Now the retry, seconds
    // later (once the chunk lands), produces the thumbnail with no reload.
    vi.useFakeTimers();
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock
      .mockRejectedValueOnce(new Error("chunk not available yet")) // still syncing
      .mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    // Attempt 1 fails but the card keeps shimmering (transient, retry scheduled).
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.thumbnailUrl).toBeNull();
    expect(result.current.pending).toBe(true);

    // The 3s backoff elapses → retry → the chunk is now available → thumbnail.
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000 + 300); });
    expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE");
    expect(result.current.pending).toBe(false);
  });

  it("shimmers only within the grace window, then icons out while transient retries continue in the background", async () => {
    vi.useFakeTimers();
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockImplementation(() => new Promise(() => {})); // never resolves

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    // Within the shimmer grace window (SHIMMER_MAX_MS) the tile shimmers.
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.pending).toBe(true);

    // A 30s decrypt-stage timeout is TRANSIENT and retries continue in the
    // BACKGROUND — but the tile no longer shimmers open-ended: past the grace
    // window it drops to its type icon (pending false).
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(result.current.pending).toBe(false);
    expect(result.current.thumbnailUrl).toBeNull();

    // Drive the remaining attempts to exhaustion: it never resolves (chunk never
    // lands) and stays iconed out (permanently failed).
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000 + 30_000 + 6_000 + 30_000 + 500); });
    expect(result.current.pending).toBe(false);
    expect(result.current.thumbnailUrl).toBeNull();
  });

  it("rejects an all-transparent (blank) raster as permanent → type icon, never caching an invisible thumbnail", async () => {
    canvasBehavior = { ...canvasBehavior, blank: true };
    const { primeThumbnails, useThumbnail, hasCachedThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ original_name: "file.svg" }));
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "file.svg"));

    // The render "succeeds" but is fully transparent — caching it would leave
    // the tile looking like an eternal shimmer. It must fail permanently and
    // fall back to the type icon (pending false, nothing cached).
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.thumbnailUrl).toBeNull();
    expect(hasCachedThumbnail("f1")).toBe(false);
  });

  it("does NOT shimmer for an already-cached thumbnail (renders it instantly)", async () => {
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });

    act(() => primeThumbnails("vault-pass"));
    const first = renderHook(() => useThumbnail("f1", "photo.jpg"));
    await waitFor(() => expect(first.result.current.thumbnailUrl).not.toBeNull());
    first.unmount();

    // A fresh hook for the same file reads the cache synchronously — no shimmer.
    const second = renderHook(() => useThumbnail("f1", "photo.jpg"));
    expect(second.result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE");
    expect(second.result.current.pending).toBe(false);
  });

  it("keeps the cached preview across clearThumbnails (lock/logout) so unlock shows it with no shimmer", async () => {
    const { primeThumbnails, useThumbnail, clearThumbnails, hasCachedThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({ data: new ArrayBuffer(4), sha256: "x", compressed: false });

    act(() => primeThumbnails("vault-pass"));
    const first = renderHook(() => useThumbnail("f1", "photo.jpg"));
    await waitFor(() => expect(first.result.current.thumbnailUrl).not.toBeNull());
    first.unmount();

    // Lock/logout must NOT drop the cached preview (that is what caused the
    // "shimmer on every login" — the cache was wiped and had to regenerate).
    act(() => clearThumbnails());
    expect(hasCachedThumbnail("f1")).toBe(true);

    // Re-unlock: the tile shows instantly from cache, never shimmers.
    act(() => primeThumbnails("vault-pass"));
    const second = renderHook(() => useThumbnail("f1", "photo.jpg"));
    expect(second.result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE");
    expect(second.result.current.pending).toBe(false);
  });

  it("marks a file failed when image rendering exceeds its safety-net timeout", async () => {
    vi.useFakeTimers();
    imageBehavior = { mode: "hang", width: 0, height: 0 };
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });

    expect(result.current.pending).toBe(false);
    expect(result.current.thumbnailUrl).toBeNull();
  });

  it("yields to an in-flight foreground decrypt before starting background work", async () => {
    vi.useFakeTimers();
    isForegroundDecryptActiveMock
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(true)
      .mockReturnValue(false);
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });

    expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE");
    expect(isForegroundDecryptActiveMock).toHaveBeenCalled();
  });

  it("caps background concurrency and drains the queue as slots free up", async () => {
    const { primeThumbnails, useThumbnail, getCachedThumbnailCount } = await loadModule();
    const gates = new Map<string, () => void>();
    getFileMetaMock.mockImplementation(
      (fileId: string) =>
        new Promise((resolve) => {
          gates.set(fileId, () => resolve(makeMeta({ id: fileId })));
        })
    );
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const files = ["a", "b", "c", "d"];
    const hooks = files.map((id) => renderHook(() => useThumbnail(id, "photo.jpg")));

    // MAX_CONCURRENT is 3: the 4th file must not even call getFileMeta yet.
    await waitFor(() => expect(gates.size).toBe(3));
    expect(gates.has("d")).toBe(false);

    gates.get("a")!();
    await waitFor(() => expect(gates.size).toBe(4));
    expect(gates.has("d")).toBe(true);

    gates.get("b")!();
    gates.get("c")!();
    gates.get("d")!();

    await waitFor(() => expect(getCachedThumbnailCount()).toBe(4));
    hooks.forEach(({ result }) =>
      expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE")
    );
  });

  it("wakes already-mounted hooks once primeThumbnails is called after mount", async () => {
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));
    expect(result.current.pending).toBe(false);
    expect(getFileMetaMock).not.toHaveBeenCalled();

    act(() => primeThumbnails("vault-pass"));

    await waitFor(() => expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE"));
  });

  it("useThumbnailCache reflects newly generated thumbnails", async () => {
    const { primeThumbnails, useThumbnail, useThumbnailCache } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    const cacheHook = renderHook(() => useThumbnailCache());
    expect(cacheHook.result.current.get("f1")).toBeUndefined();

    act(() => primeThumbnails("vault-pass"));
    renderHook(() => useThumbnail("f1", "photo.jpg"));

    await waitFor(() =>
      expect(cacheHook.result.current.get("f1")).toBe("data:image/webp;base64,FAKE")
    );
  });

  it("marks a video failed on a decode error event", async () => {
    videoBehavior = { mode: "error", width: 0, height: 0 };
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ original_name: "clip.mp4" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "clip.mp4"));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.thumbnailUrl).toBeNull();
  });

  it("marks a video failed when it has no 2D canvas context", async () => {
    canvasBehavior.ctxAvailable = false;
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ original_name: "clip.mp4" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "clip.mp4"));

    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.thumbnailUrl).toBeNull();
  });

  it("falls back to capturing immediately when setting currentTime throws (seek not yet allowed)", async () => {
    videoBehavior = { mode: "success", width: 640, height: 360, seekThrows: true };
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ original_name: "clip.mp4" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "clip.mp4"));

    await waitFor(() => expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE"));
  });

  it("proceeds anyway once the foreground-yield safety cap elapses, instead of waiting forever", async () => {
    vi.useFakeTimers();
    isForegroundDecryptActiveMock.mockReturnValue(true); // never idle
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE");
  });

  it("persists a generated thumbnail to IndexedDB and hydrates it into a fresh module instance on reload", async () => {
    const { IDBFactory } = await import("fake-indexeddb");
    globalThis.indexedDB = new IDBFactory();

    const mod1 = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => mod1.primeThumbnails("vault-pass"));
    const hook1 = renderHook(() => mod1.useThumbnail("f1", "photo.jpg"));
    await waitFor(() =>
      expect(hook1.result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE")
    );
    hook1.unmount();

    // dbPut() is fire-and-forget; give its IndexedDB transaction a couple of
    // real ticks to land before "reloading" into a fresh module instance.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    const mod2 = await loadModule(); // fresh module singletons, same fake IndexedDB
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(mod2.hasCachedThumbnail("f1")).toBe(true);
  });

  it("does not hydrate at import time in a non-browser (SSR) context", async () => {
    vi.stubGlobal("window", undefined);
    let mod: Awaited<ReturnType<typeof loadModule>>;
    try {
      mod = await loadModule();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(mod.hasCachedThumbnail("f1")).toBe(false);
  });

  it("falls back to memory-only when the IndexedDB open request itself errors", async () => {
    type FakeOpenRequest = {
      onupgradeneeded: (() => void) | null;
      onsuccess: (() => void) | null;
      onerror: (() => void) | null;
      error: Error;
      result?: unknown;
    };
    class FailingIDBFactory {
      open(): FakeOpenRequest {
        const req: FakeOpenRequest = {
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null,
          error: new Error("IndexedDB blocked"),
        };
        // Real IndexedDB failures (quota exceeded, private-mode restrictions,
        // blocked upgrades) surface via the request's onerror event, not a
        // thrown exception — fire it on a microtask like a real browser would.
        Promise.resolve().then(() => req.onerror?.());
        return req;
      }
    }
    globalThis.indexedDB = new FailingIDBFactory() as unknown as IDBFactory;

    const mod = await loadModule(); // hydrate() runs at import, hits the failing open()
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(mod.hasCachedThumbnail("f1")).toBe(false);

    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    // The failed IndexedDB open must not break the memory-only fast path.
    act(() => mod.primeThumbnails("vault-pass"));
    const { result } = renderHook(() => mod.useThumbnail("f1", "photo.jpg"));
    await waitFor(() => expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE"));
  });

  it("falls back to a 300px logical size when the image reports no intrinsic dimensions (e.g. some SVGs)", async () => {
    imageBehavior = { mode: "success", width: 0, height: 0 };
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await waitFor(() => expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE"));
  });

  it("falls back to img.width/height when only naturalWidth/Height are zero", async () => {
    imageBehavior = { mode: "success", width: 0, height: 0, fallbackWidth: 500, fallbackHeight: 400 };
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta());
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await waitFor(() => expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE"));
  });

  it("falls back to a 2s seek estimate when the video reports a non-finite duration", async () => {
    videoBehavior = { mode: "success", width: 640, height: 360, duration: Infinity };
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ original_name: "clip.mp4" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "clip.mp4"));

    await waitFor(() => expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE"));
  });

  it("ignores a second settle attempt after the video thumbnail already resolved (defensive double-callback guards)", async () => {
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ original_name: "clip.mp4" }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: false,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "clip.mp4"));
    await waitFor(() => expect(result.current.thumbnailUrl).toBe("data:image/webp;base64,FAKE"));

    // The underlying <video> already settled (resolved); a stray extra
    // onseeked/onerror firing afterwards must be a silent no-op, not a crash.
    expect(() => lastFakeVideo?.onseeked?.()).not.toThrow();
    expect(() => lastFakeVideo?.onerror?.()).not.toThrow();
  });

  it("memoizes the zstd codec across multiple compressed chunks in one file", async () => {
    const decompress = vi.fn(() => new Uint8Array([9, 9, 9]));
    getZstdCodecMock.mockResolvedValue({ ZstdStream: { decompress } });
    const { primeThumbnails, useThumbnail } = await loadModule();
    getFileMetaMock.mockResolvedValue(makeMeta({ chunk_count: 2 }));
    getFileChunkMock.mockResolvedValue({
      data: new ArrayBuffer(4),
      sha256: "x",
      compressed: true,
    });

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    await waitFor(() => expect(result.current.thumbnailUrl).not.toBeNull());
    expect(decompress).toHaveBeenCalledTimes(2);
    expect(getZstdCodecMock).toHaveBeenCalledTimes(1); // fetched once, reused for chunk 2
  });

  it("still cleans up (inflight, loading, notify) if acquiring a concurrency slot itself throws", async () => {
    vi.useFakeTimers();
    isForegroundDecryptActiveMock.mockImplementation(() => {
      throw new Error("boom");
    });
    const { primeThumbnails, useThumbnail } = await loadModule();

    act(() => primeThumbnails("vault-pass"));
    const { result } = renderHook(() => useThumbnail("f1", "photo.jpg"));

    // Even though acquireSlot threw, inflight/loading are cleared (the finally
    // always runs) — this is the fix for the perpetual-shimmer-on-stuck-slot bug.
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.loading).toBe(false);
    expect(result.current.thumbnailUrl).toBeNull();

    // A slot-acquire failure is transient, so it retries; drive both backoffs to
    // exhaust the attempts and confirm it eventually gives up.
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000 + 6_000 + 300); });
    expect(result.current.pending).toBe(false);
    expect(result.current.loading).toBe(false);
  });
});
