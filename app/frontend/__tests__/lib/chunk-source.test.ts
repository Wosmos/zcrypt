import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getFileChunk: vi.fn(),
  getFileLocators: vi.fn(),
  resolveWebDirect: vi.fn(),
  downloadTelegramChunk: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ getFileChunk: m.getFileChunk, getFileLocators: m.getFileLocators }));
vi.mock("@/lib/byos-direct", () => ({ resolveWebDirect: m.resolveWebDirect }));
vi.mock("@/lib/telegram-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram-download")>()),
  downloadTelegramChunk: m.downloadTelegramChunk,
}));

import { createChunkSource, resetDirectDownloadState } from "@/lib/chunk-source";
import { TelegramUnreachableError } from "@/lib/telegram-download";
import { sha256Hex } from "@/lib/crypto";
import { DIRECT_UNREACHABLE_FOR_MS, StalledError } from "@/lib/transport";

const TARGET = {
  platform: "telegram",
  account: "vault_bot",
  telegram: { botToken: "123:SECRET", chatId: "-100777" },
};
const PLAIN = new Uint8Array([1, 2, 3, 4]);
let PLAIN_SHA = "";

function loc(index: number, over: Record<string, unknown> = {}) {
  return {
    index,
    platform: "telegram",
    account: "vault_bot",
    repo: "r",
    remote_path: `${index}:FID${index}`,
    size: 4,
    sha256: PLAIN_SHA,
    compressed: true,
    ...over,
  };
}
const relayChunk = { data: new Uint8Array([9]).buffer, sha256: "relay", compressed: false };

beforeEach(async () => {
  PLAIN_SHA = await sha256Hex(PLAIN);
  for (const fn of Object.values(m)) fn.mockReset();
  resetDirectDownloadState();
  m.resolveWebDirect.mockResolvedValue(TARGET);
  m.getFileLocators.mockResolvedValue({ file_id: "f", chunks: [loc(0), loc(1)] });
  m.downloadTelegramChunk.mockImplementation(async () => PLAIN.slice());
  m.getFileChunk.mockResolvedValue(relayChunk);
});
afterEach(() => vi.useRealTimers());

describe("createChunkSource", () => {
  it("reads a chunk stored on the user's own Telegram straight from it, verified by its sha256", async () => {
    const out = await createChunkSource("f")(0);

    expect(new Uint8Array(out.data)).toEqual(PLAIN);
    expect(out.sha256).toBe(PLAIN_SHA);
    expect(out.compressed).toBe(true);
    expect(m.downloadTelegramChunk).toHaveBeenCalledWith(TARGET.telegram, "0:FID0", undefined);
    expect(m.getFileChunk).not.toHaveBeenCalled();
  });

  it("looks the locators up once per download, not once per chunk", async () => {
    const fetchChunk = createChunkSource("f");
    await fetchChunk(0);
    await fetchChunk(1);
    expect(m.getFileLocators).toHaveBeenCalledTimes(1);
  });

  it("rejects bytes that do not match the recorded sha256 and relays that chunk instead", async () => {
    m.downloadTelegramChunk.mockResolvedValue(new Uint8Array([6, 6, 6]));
    const out = await createChunkSource("f")(0);
    expect(out).toBe(relayChunk);
    expect(m.getFileChunk).toHaveBeenCalledWith("f", 0, undefined);
  });

  it("falls back to the relay when Telegram is unreachable (CORS or blocked) and skips it for 10 minutes", async () => {
    vi.useFakeTimers();
    m.downloadTelegramChunk.mockRejectedValue(new TelegramUnreachableError(new TypeError("cors")));
    const fetchChunk = createChunkSource("f");

    expect(await fetchChunk(0)).toBe(relayChunk);
    expect(await fetchChunk(1)).toBe(relayChunk);
    expect(m.downloadTelegramChunk).toHaveBeenCalledTimes(1);

    vi.setSystemTime(Date.now() + DIRECT_UNREACHABLE_FOR_MS + 1);
    m.downloadTelegramChunk.mockImplementation(async () => PLAIN.slice());
    const back = await createChunkSource("f")(0);
    expect(new Uint8Array(back.data)).toEqual(PLAIN);
  });

  it("does not treat a slow or stalled body as unreachable: the next chunk still tries Telegram", async () => {
    m.downloadTelegramChunk.mockRejectedValueOnce(new StalledError()).mockImplementation(async () => PLAIN.slice());
    const fetchChunk = createChunkSource("f");

    expect(await fetchChunk(0)).toBe(relayChunk);
    const second = await fetchChunk(1);

    expect(new Uint8Array(second.data)).toEqual(PLAIN);
    expect(m.downloadTelegramChunk).toHaveBeenCalledTimes(2);
  });

  it("relays everything when the user has no reachable own Telegram, without asking for locators", async () => {
    m.resolveWebDirect.mockResolvedValue(null);
    const out = await createChunkSource("f")(0);
    expect(out).toBe(relayChunk);
    expect(m.getFileLocators).not.toHaveBeenCalled();
    expect(m.downloadTelegramChunk).not.toHaveBeenCalled();
  });

  it("relays when the locators cannot be fetched (not the owner, server down)", async () => {
    m.getFileLocators.mockRejectedValue(new Error("403"));
    expect(await createChunkSource("f")(0)).toBe(relayChunk);
    expect(m.downloadTelegramChunk).not.toHaveBeenCalled();
  });

  it("relays a chunk with no locator, or one stored under another bot", async () => {
    m.getFileLocators.mockResolvedValue({ file_id: "f", chunks: [loc(0, { account: "someone_else_bot" })] });
    const fetchChunk = createChunkSource("f");
    expect(await fetchChunk(0)).toBe(relayChunk);
    expect(await fetchChunk(5)).toBe(relayChunk);
    expect(m.downloadTelegramChunk).not.toHaveBeenCalled();
  });

  it("relays a chunk stored on another platform", async () => {
    m.getFileLocators.mockResolvedValue({ file_id: "f", chunks: [loc(0, { platform: "github" })] });
    expect(await createChunkSource("f")(0)).toBe(relayChunk);
  });

  it("lets a caller's abort through as an AbortError instead of relaying", async () => {
    m.downloadTelegramChunk.mockRejectedValue(new DOMException("x", "AbortError"));
    await expect(createChunkSource("f")(0, new AbortController().signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(m.getFileChunk).not.toHaveBeenCalled();
  });

  it("still surfaces a relay failure when direct failed too", async () => {
    m.downloadTelegramChunk.mockRejectedValue(new StalledError());
    m.getFileChunk.mockRejectedValue(Object.assign(new Error("gone"), { status: 410 }));
    await expect(createChunkSource("f")(0)).rejects.toMatchObject({ status: 410 });
  });
});
