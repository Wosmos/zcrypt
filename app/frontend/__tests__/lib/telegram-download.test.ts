import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TelegramUnreachableError,
  clearTelegramFilePaths,
  downloadTelegramChunk,
  telegramFileIds,
} from "@/lib/telegram-download";
import { FILE_PATH_TTL_MS, StalledError } from "@/lib/transport";

const target = { botToken: "123:SECRET", chatId: "-100777" };

function getFileOk(path: string) {
  return new Response(JSON.stringify({ ok: true, result: { file_path: path } }), { status: 200 });
}
function bytes(...b: number[]) {
  return new Response(new Uint8Array(b), { status: 200 });
}
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  clearTelegramFilePaths();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("TelegramUnreachableError", () => {
  it("names an Error cause by its message and anything else by its text", () => {
    expect(new TelegramUnreachableError(new TypeError("Failed to fetch")).message).toBe(
      "Telegram unreachable: Failed to fetch",
    );
    const odd = new TelegramUnreachableError("blocked");
    expect(odd.message).toBe("Telegram unreachable: blocked");
    expect(odd.name).toBe("TelegramUnreachableError");
  });
});

describe("telegramFileIds", () => {
  it("takes the file id out of each msgId:fileId part, in order", () => {
    expect(telegramFileIds("1:AAA,2:BBB")).toEqual(["AAA", "BBB"]);
  });
  it("rejects a part with no file id", () => {
    expect(() => telegramFileIds("12")).toThrow(/bad telegram part ref/);
    expect(() => telegramFileIds("12:")).toThrow(/bad telegram part ref/);
  });
});

describe("downloadTelegramChunk", () => {
  it("asks getFile, then reads the bytes from the /file/bot URL", async () => {
    fetchMock.mockResolvedValueOnce(getFileOk("documents/file_1.bin")).mockResolvedValueOnce(bytes(1, 2, 3));

    const out = await downloadTelegramChunk(target, "9:FID");

    expect(new Uint8Array(out)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.telegram.org/bot123:SECRET/getFile?file_id=FID");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.telegram.org/file/bot123:SECRET/documents/file_1.bin");
  });

  it("joins the parts of a split chunk in order", async () => {
    fetchMock
      .mockResolvedValueOnce(getFileOk("p/a"))
      .mockResolvedValueOnce(bytes(1, 2))
      .mockResolvedValueOnce(getFileOk("p/b"))
      .mockResolvedValueOnce(bytes(3));
    const out = await downloadTelegramChunk(target, "1:A,2:B");
    expect(new Uint8Array(out)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("remembers a file_path for 50 minutes and asks again after that", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(getFileOk("p/a"))
      .mockResolvedValueOnce(bytes(1))
      .mockResolvedValueOnce(bytes(1))
      .mockResolvedValueOnce(getFileOk("p/a2"))
      .mockResolvedValueOnce(bytes(1));

    await downloadTelegramChunk(target, "1:A");
    await downloadTelegramChunk(target, "1:A");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    vi.setSystemTime(Date.now() + FILE_PATH_TTL_MS + 1);
    await downloadTelegramChunk(target, "1:A");
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(fetchMock.mock.calls[4][0]).toContain("/file/bot123:SECRET/p/a2");
  });

  it("refreshes a cached file_path that now answers 404 and succeeds with the new one", async () => {
    fetchMock
      .mockResolvedValueOnce(getFileOk("old/path"))
      .mockResolvedValueOnce(bytes(1))
      .mockResolvedValueOnce(new Response("gone", { status: 404 }))
      .mockResolvedValueOnce(getFileOk("new/path"))
      .mockResolvedValueOnce(bytes(7, 8));

    await downloadTelegramChunk(target, "1:A");
    const out = await downloadTelegramChunk(target, "1:A");

    expect(new Uint8Array(out)).toEqual(new Uint8Array([7, 8]));
    expect(fetchMock.mock.calls[4][0]).toContain("/file/bot123:SECRET/new/path");
  });

  it("calls an unanswered request unreachable and does not retry it", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(downloadTelegramChunk(target, "1:A")).rejects.toBeInstanceOf(TelegramUnreachableError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a CORS refusal of the file URL (a TypeError after getFile worked) is unreachable too", async () => {
    fetchMock.mockResolvedValueOnce(getFileOk("p/a")).mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(downloadTelegramChunk(target, "1:A")).rejects.toBeInstanceOf(TelegramUnreachableError);
  });

  it("does not call a body that breaks mid-read unreachable", async () => {
    const broken = new Response(
      new ReadableStream({
        start(c) {
          c.error(new TypeError("network error"));
        },
      }),
    );
    fetchMock.mockResolvedValue(getFileOk("p/a")).mockResolvedValueOnce(getFileOk("p/a")).mockResolvedValueOnce(broken);
    const err = await downloadTelegramChunk(target, "1:A").catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(TelegramUnreachableError);
  });

  it("retries a 503 once and then succeeds", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(getFileOk("p/a"))
      .mockResolvedValueOnce(new Response("busy", { status: 503 }))
      .mockResolvedValueOnce(getFileOk("p/a"))
      .mockResolvedValueOnce(bytes(5));
    const pending = downloadTelegramChunk(target, "1:A");
    await vi.advanceTimersByTimeAsync(5_000);
    expect(new Uint8Array(await pending)).toEqual(new Uint8Array([5]));
  });

  it("waits out the retry_after a 429 getFile asks for", async () => {
    vi.useFakeTimers();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ ok: false, description: "Too Many Requests", parameters: { retry_after: 20 } }),
          { status: 429 },
        ),
      )
      .mockResolvedValueOnce(getFileOk("p/a"))
      .mockResolvedValueOnce(bytes(5));
    const pending = downloadTelegramChunk(target, "1:A");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(11_000);
    expect(new Uint8Array(await pending)).toEqual(new Uint8Array([5]));
  });

  it("gives a stalled body 60s with no bytes, then raises a StalledError", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((url: string, init: RequestInit) => {
      if (url.includes("getFile")) return Promise.resolve(getFileOk("p/a"));
      return new Promise((_r, reject) =>
        init.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))),
      );
    });
    const pending = downloadTelegramChunk(target, "1:A");
    const assertion = expect(pending).rejects.toBeInstanceOf(StalledError);
    await vi.advanceTimersByTimeAsync(200_000);
    await assertion;
  });

  it("keeps a caller's abort an AbortError", async () => {
    const ctl = new AbortController();
    fetchMock.mockImplementation(
      (_u: string, init: RequestInit) =>
        new Promise((_r, reject) =>
          init.signal?.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))),
        ),
    );
    const pending = downloadTelegramChunk(target, "1:A", ctl.signal);
    ctl.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("reports a getFile refusal with its status", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, description: "file is too big" }), { status: 400 }),
    );
    await expect(downloadTelegramChunk(target, "1:A")).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a status message when getFile refuses without a description", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: 400 }));
    await expect(downloadTelegramChunk(target, "1:A")).rejects.toMatchObject({
      message: "getFile failed: 400",
      status: 400,
    });
  });

  it("forgets every remembered file_path once the cache holds 4096, then remembers afresh", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes("/getFile?") ? getFileOk("p/x") : bytes(1),
    );
    const many = Array.from({ length: 4097 }, (_, i) => `${i}:id${i}`).join(",");
    await downloadTelegramChunk(target, many);
    fetchMock.mockClear();

    await downloadTelegramChunk(target, "1:id4096");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockClear();
    await downloadTelegramChunk(target, "1:id0");
    expect(fetchMock.mock.calls[0][0]).toContain("/getFile?file_id=id0");
  });
});
