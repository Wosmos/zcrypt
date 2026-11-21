import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  getFileChunk: vi.fn(),
  getFileLocators: vi.fn(),
  getChunkLink: vi.fn(),
  downloadLinkedChunk: vi.fn(),
  resolveWebDirect: vi.fn(),
  downloadTelegramChunk: vi.fn(),
  relayFitsNow: vi.fn(),
  relayShortfall: vi.fn(),
  waitForTelegram: vi.fn(),
}));
vi.mock("@/lib/relay-gate", () => ({
  relayFitsNow: m.relayFitsNow,
  relayShortfall: m.relayShortfall,
}));
vi.mock("@/lib/transfer-wait", () => ({ waitForTelegram: m.waitForTelegram }));
vi.mock("@/lib/api", () => ({
  getFileChunk: m.getFileChunk,
  getFileLocators: m.getFileLocators,
  getChunkLink: m.getChunkLink,
  downloadLinkedChunk: m.downloadLinkedChunk,
}));
vi.mock("@/lib/byos-direct", () => ({ resolveWebDirect: m.resolveWebDirect }));
vi.mock("@/lib/telegram-download", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/telegram-download")>()),
  downloadTelegramChunk: m.downloadTelegramChunk,
}));

import { createChunkSource, LINK_FAILURES_BEFORE_OFF, resetDirectDownloadState } from "@/lib/chunk-source";
import { TelegramUnreachableError } from "@/lib/telegram-download";
import { sha256Hex } from "@/lib/crypto";
import { DIRECT_UNREACHABLE_FOR_MS, StalledError } from "@/lib/transport";
import { ApiError } from "@/lib/http-error";
import { WebTransferLimitCode, WebTransferLimitError } from "@/lib/web-transfer-limit";

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
  m.relayFitsNow.mockResolvedValue(true);
  m.relayShortfall.mockResolvedValue(null);
  m.waitForTelegram.mockResolvedValue(undefined);
  m.getChunkLink.mockResolvedValue(null);
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

  it("asks for the locators again on the next chunk after a failed lookup", async () => {
    m.getFileLocators.mockRejectedValueOnce(new Error("502"));
    const fetchChunk = createChunkSource("f");
    expect(await fetchChunk(0)).toBe(relayChunk);
    const second = await fetchChunk(1);
    expect(new Uint8Array(second.data)).toEqual(PLAIN);
    expect(m.getFileLocators).toHaveBeenCalledTimes(2);
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

describe("createChunkSource with a transfer row to hold", () => {
  const blocked = () =>
    m.downloadTelegramChunk.mockRejectedValue(new TelegramUnreachableError(new TypeError("cors")));

  it("goes through the server while the rest of the file fits the allowance", async () => {
    blocked();
    const out = await createChunkSource("f", { waitKey: "dl:1" })(0);
    expect(out).toBe(relayChunk);
    expect(m.relayFitsNow).toHaveBeenCalledWith(8, 0);
    expect(m.waitForTelegram).not.toHaveBeenCalled();
  });

  it("waits for Telegram instead of using the server when the rest does not fit, then reads directly", async () => {
    blocked();
    m.relayFitsNow.mockResolvedValue(false);
    m.waitForTelegram.mockImplementation(async () => {
      m.downloadTelegramChunk.mockImplementation(async () => PLAIN.slice());
      resetDirectDownloadState();
    });
    const ctl = new AbortController();
    const out = await createChunkSource("f", { waitKey: "dl:1" })(0, ctl.signal);

    expect(m.waitForTelegram).toHaveBeenCalledWith("dl:1", "telegram_blocked", ctl.signal);
    expect(m.getFileChunk).not.toHaveBeenCalled();
    expect(new Uint8Array(out.data)).toEqual(PLAIN);
  });

  it("counts only the chunks still to fetch when it checks what fits", async () => {
    const fetchChunk = createChunkSource("f", { waitKey: "dl:1" });
    await fetchChunk(0);
    blocked();
    await fetchChunk(1);
    expect(m.relayFitsNow).toHaveBeenCalledWith(4, 0);
  });

  it("holds the download when the server refuses on the allowance, then continues", async () => {
    blocked();
    m.getFileChunk
      .mockRejectedValueOnce(
        new WebTransferLimitError(WebTransferLimitCode.DailyExceeded, { limitBytes: 1 }, 403),
      )
      .mockResolvedValue(relayChunk);
    const out = await createChunkSource("f", { waitKey: "dl:1" })(0);

    expect(m.waitForTelegram).toHaveBeenCalledWith("dl:1", "allowance_used_up", undefined);
    expect(out).toBe(relayChunk);
    expect(m.getFileChunk).toHaveBeenCalledTimes(2);
  });

  it("recognises an allowance refusal that arrives as a plain API error with its code", async () => {
    blocked();
    m.getFileChunk
      .mockRejectedValueOnce(new ApiError("used up", 403, 0, "", "relay_allowance_exceeded"))
      .mockResolvedValue(relayChunk);
    await createChunkSource("f", { waitKey: "dl:1" })(0);
    expect(m.waitForTelegram).toHaveBeenCalledWith("dl:1", "allowance_used_up", undefined);
  });

  it("does not hold on any other server error", async () => {
    blocked();
    m.getFileChunk.mockRejectedValue(new ApiError("gone", 404));
    await expect(createChunkSource("f", { waitKey: "dl:1" })(0)).rejects.toThrow("gone");
    expect(m.waitForTelegram).not.toHaveBeenCalled();
  });

  it("without a row to show a wait on, a refusal stands and the server decides", async () => {
    blocked();
    m.relayFitsNow.mockResolvedValue(false);
    m.getFileChunk.mockRejectedValue(
      new WebTransferLimitError(WebTransferLimitCode.AllowanceExceeded, { limitBytes: 1 }, 403),
    );
    await expect(createChunkSource("f")(0)).rejects.toBeInstanceOf(WebTransferLimitError);
    expect(m.waitForTelegram).not.toHaveBeenCalled();
    expect(m.relayFitsNow).not.toHaveBeenCalled();
  });

  it("never holds a chunk that is not on the user's own Telegram", async () => {
    m.getFileLocators.mockResolvedValue({ file_id: "f", chunks: [loc(0, { platform: "github" })] });
    m.getFileChunk.mockRejectedValue(
      new WebTransferLimitError(WebTransferLimitCode.AllowanceExceeded, { limitBytes: 1 }, 403),
    );
    await expect(createChunkSource("f", { waitKey: "dl:1" })(0)).rejects.toBeInstanceOf(
      WebTransferLimitError,
    );
    expect(m.waitForTelegram).not.toHaveBeenCalled();
  });
});

describe("createChunkSource, chunks that only come through the server", () => {
  const short = new WebTransferLimitError(
    WebTransferLimitCode.DailyExceeded,
    { limitBytes: 100, usedBytes: 90, resetsAt: "2026-11-20T00:00:00Z", neededBytes: 30 },
    403,
  );
  const mixed = () =>
    m.getFileLocators.mockResolvedValue({
      file_id: "f",
      chunks: [loc(0, { platform: "github", size: 10 }), loc(1), loc(2, { platform: "huggingface", size: 20 })],
    });

  it("stops before fetching anything when the server-only rest does not fit", async () => {
    mixed();
    m.relayShortfall.mockResolvedValue(short);
    await expect(createChunkSource("f", { waitKey: "dl:1" })(0)).rejects.toBe(short);
    expect(m.relayShortfall).toHaveBeenCalledWith(30);
    expect(m.getFileChunk).not.toHaveBeenCalled();
  });

  it("checks once per download and then lets the server decide", async () => {
    mixed();
    const fetchChunk = createChunkSource("f", { waitKey: "dl:1" });
    await fetchChunk(0);
    await fetchChunk(2);
    expect(m.relayShortfall).toHaveBeenCalledTimes(1);
    expect(m.getFileChunk).toHaveBeenCalledTimes(2);
  });

  it("skips the allowance check and still relays when the locators cannot be read", async () => {
    m.getFileLocators.mockRejectedValue(new Error("403"));
    await expect(createChunkSource("f", { waitKey: "dl:1" })(0)).resolves.toEqual(relayChunk);
    expect(m.relayShortfall).not.toHaveBeenCalled();
    expect(m.getFileChunk).toHaveBeenCalledTimes(1);
  });

  it("does not check for previews, which have no row to explain it on", async () => {
    mixed();
    m.relayShortfall.mockResolvedValue(short);
    await expect(createChunkSource("f")(0)).resolves.toEqual(relayChunk);
    expect(m.relayShortfall).not.toHaveBeenCalled();
  });
});

describe("platform links (GitHub / Hugging Face)", () => {
  const hfOnly = () =>
    m.getFileLocators.mockResolvedValue({
      file_id: "f",
      chunks: [loc(0, { platform: "huggingface" }), loc(1, { platform: "huggingface" })],
    });
  const link = (sha = PLAIN_SHA) => ({
    url: "https://us.aws.cdn.hf.co/x",
    expires_at: "",
    size: 4,
    sha256: sha,
    compressed: true,
  });

  beforeEach(() => {
    m.resolveWebDirect.mockResolvedValue(null);
    hfOnly();
    m.getChunkLink.mockResolvedValue(link());
    m.downloadLinkedChunk.mockImplementation(async () => PLAIN.slice().buffer);
  });

  it("reads a chunk from its platform link, verified, without the server or the allowance", async () => {
    const fetchChunk = createChunkSource("f", { waitKey: "dl:f" });
    const out = await fetchChunk(0);
    await fetchChunk(1);

    expect(new Uint8Array(out.data)).toEqual(PLAIN);
    expect(out).toMatchObject({ sha256: PLAIN_SHA, compressed: true });
    expect(m.downloadLinkedChunk).toHaveBeenCalledWith("https://us.aws.cdn.hf.co/x", undefined);
    expect(m.getFileChunk).not.toHaveBeenCalled();
    expect(m.relayShortfall).not.toHaveBeenCalled();
  });

  it("sends only the chunk whose linked bytes don't match through the server", async () => {
    m.getChunkLink.mockResolvedValueOnce(link("other"));
    const fetchChunk = createChunkSource("f");

    expect(await fetchChunk(0)).toBe(relayChunk);
    expect(new Uint8Array((await fetchChunk(1)).data)).toEqual(PLAIN);
    expect(m.getFileChunk).toHaveBeenCalledTimes(1);
  });

  it("a chunk with no link yet (409) does not stop the next chunk using its link", async () => {
    m.getChunkLink.mockResolvedValueOnce(null);
    const fetchChunk = createChunkSource("f");

    expect(await fetchChunk(0)).toBe(relayChunk);
    expect(new Uint8Array((await fetchChunk(1)).data)).toEqual(PLAIN);
  });

  it("retries a failed read once with a fresh link", async () => {
    m.downloadLinkedChunk.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const out = await createChunkSource("f")(0);

    expect(new Uint8Array(out.data)).toEqual(PLAIN);
    expect(m.getChunkLink).toHaveBeenCalledTimes(2);
    expect(m.getFileChunk).not.toHaveBeenCalled();
  });

  it(`turns links off after ${LINK_FAILURES_BEFORE_OFF} chunks in a row fail, and a success resets the count`, async () => {
    m.getFileLocators.mockResolvedValue({
      file_id: "f",
      chunks: [0, 1, 2, 3, 4].map((i) => loc(i, { platform: "huggingface" })),
    });
    const fail = new TypeError("Failed to fetch");
    m.downloadLinkedChunk
      .mockRejectedValueOnce(fail)
      .mockRejectedValueOnce(fail)
      .mockImplementationOnce(async () => PLAIN.slice().buffer)
      .mockRejectedValue(fail);
    const fetchChunk = createChunkSource("f");

    expect(await fetchChunk(0)).toBe(relayChunk);
    expect(new Uint8Array((await fetchChunk(1)).data)).toEqual(PLAIN);
    expect(await fetchChunk(2)).toBe(relayChunk);
    expect(await fetchChunk(3)).toBe(relayChunk);
    const asked = m.getChunkLink.mock.calls.length;
    expect(await fetchChunk(4)).toBe(relayChunk);
    expect(m.getChunkLink).toHaveBeenCalledTimes(asked);
  });

  it("falls back to the server when the link can't be fetched, checking the rest fits first", async () => {
    m.downloadLinkedChunk.mockRejectedValue(new TypeError("Failed to fetch"));
    const fetchChunk = createChunkSource("f", { waitKey: "dl:f" });

    expect(await fetchChunk(0)).toBe(relayChunk);
    expect(m.relayShortfall).toHaveBeenCalledWith(8);
  });

  it("uses the server when the chunk has no link", async () => {
    m.getChunkLink.mockResolvedValue(null);
    expect(await createChunkSource("f")(0)).toBe(relayChunk);
    expect(m.downloadLinkedChunk).not.toHaveBeenCalled();
  });

  it("a cancel while reading the link stays a cancel, not a server fallback", async () => {
    m.downloadLinkedChunk.mockRejectedValue(new DOMException("aborted", "AbortError"));
    await expect(createChunkSource("f")(0)).rejects.toThrow("aborted");
    expect(m.getFileChunk).not.toHaveBeenCalled();
  });
});
