import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTokenViewer, type DecryptContext } from "@/components/tokens/use-token-viewer";

const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/utils", async (orig) => ({ ...(await orig<typeof import("@/lib/utils")>()), saveBlob }));

afterEach(() => vi.clearAllMocks());

const make = (decrypt: Parameters<typeof useTokenViewer>[0]["decrypt"]) =>
  renderHook(() =>
    useTokenViewer({
      enabled: true,
      decrypt,
      previewFallback: "p",
      downloadFallback: "d",
      fallbackSaveName: "f",
    }),
  );

describe("useTokenViewer", () => {
  it("cancel aborts the running decrypt and returns to ready without an error", async () => {
    let seen: AbortSignal | undefined;
    const { result } = make((_p, { signal }) => {
      seen = signal;
      return new Promise((_r, reject) =>
        signal.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))),
      );
    });
    let run!: Promise<void>;
    act(() => {
      run = result.current.handleDownload() as Promise<void>;
    });
    expect(result.current.pageState).toBe("decrypting");
    act(() => result.current.cancel());
    await act(async () => run);
    expect(seen?.aborted).toBe(true);
    expect(result.current.pageState).toBe("ready");
    expect(result.current.errorMsg).toBe("");
  });

  it("a download already streamed to disk is done without saving a blob", async () => {
    const { result } = make(async () => ({ originalName: "big.bin" }));
    await act(async () => result.current.handleDownload());
    expect(saveBlob).not.toHaveBeenCalled();
    expect(result.current.pageState).toBe("done");
    expect(result.current.fileName).toBe("big.bin");
  });

  it("a null result (the Save-As dialog was dismissed) goes back to ready", async () => {
    const { result } = make(async () => null);
    await act(async () => result.current.handleDownload());
    expect(result.current.pageState).toBe("ready");
  });

  it("passes the purpose so a preview is never streamed to disk", async () => {
    const decrypt = vi.fn(async (_p: unknown, _c: DecryptContext) => ({
      blob: new Blob(["x"]),
      originalName: "a.txt",
    }));
    const { result } = make(decrypt);
    await act(async () => result.current.handlePreview());
    expect(decrypt.mock.calls[0][1].purpose).toBe("preview");
  });
});
