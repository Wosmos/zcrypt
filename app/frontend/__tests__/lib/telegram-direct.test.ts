import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TELEGRAM_MAX_PART_SIZE,
  TelegramApiError,
  isRetryableTelegramError,
  isTelegramTransportError,
  telegramChunkFilename,
  telegramPartRanges,
  uploadTelegramChunk,
} from "@/lib/telegram-direct";

type Reply =
  | { kind: "json"; status: number; body: unknown }
  | { kind: "raw"; status: number; text: string }
  | { kind: "network" }
  | { kind: "hang" };

class FakeXHR {
  static instances: FakeXHR[] = [];
  static replies: Reply[] = [];
  method = "";
  url = "";
  status = 0;
  responseText = "";
  form: FormData | null = null;
  upload: { onprogress: ((e: ProgressEvent) => void) | null; onload: (() => void) | null } = {
    onprogress: null,
    onload: null,
  };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXHR.instances.push(this);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  send(form: FormData) {
    this.form = form;
    const reply = FakeXHR.replies.shift() ?? { kind: "json", status: 200, body: ok(1, "F") };
    if (reply.kind === "hang") return;
    queueMicrotask(() => {
      const doc = form.get("document") as Blob;
      this.upload.onprogress?.({ loaded: doc.size + 100 } as ProgressEvent);
      this.upload.onload?.();
      if (reply.kind === "network") {
        this.onerror?.();
        return;
      }
      this.status = reply.status;
      this.responseText = reply.kind === "raw" ? reply.text : JSON.stringify(reply.body);
      this.onload?.();
    });
  }
  abort() {
    this.onabort?.();
  }
}

function ok(messageId: number, fileId: string) {
  return { ok: true, result: { message_id: messageId, document: { file_id: fileId } } };
}

const target = { botToken: "123:SECRET", chatId: "-100777" };

beforeEach(() => {
  vi.useFakeTimers();
  FakeXHR.instances = [];
  FakeXHR.replies = [];
  vi.stubGlobal("XMLHttpRequest", FakeXHR as unknown as typeof XMLHttpRequest);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("telegram chunk naming and splitting", () => {
  it("names chunks like the server and desktop do", () => {
    expect(telegramChunkFilename()).toMatch(/^[0-9a-f]{16}\.bin$/);
  });

  it("keeps a chunk under the download limit as one part and splits a larger one", () => {
    expect(telegramPartRanges(10)).toEqual([[0, 10]]);
    expect(telegramPartRanges(TELEGRAM_MAX_PART_SIZE)).toEqual([[0, TELEGRAM_MAX_PART_SIZE]]);
    expect(telegramPartRanges(TELEGRAM_MAX_PART_SIZE * 2 + 5)).toEqual([
      [0, TELEGRAM_MAX_PART_SIZE],
      [TELEGRAM_MAX_PART_SIZE, TELEGRAM_MAX_PART_SIZE * 2],
      [TELEGRAM_MAX_PART_SIZE * 2, TELEGRAM_MAX_PART_SIZE * 2 + 5],
    ]);
  });
});

describe("error classification", () => {
  it("retries transport failures, rate limits and 500s only", () => {
    expect(isRetryableTelegramError(new TypeError("Network request failed"))).toBe(true);
    expect(isRetryableTelegramError(new Error("Upload stalled (no progress for 60s)"))).toBe(true);
    expect(isRetryableTelegramError(new TelegramApiError("x", 429, 0))).toBe(true);
    expect(isRetryableTelegramError(new TelegramApiError("x", 500, 0))).toBe(true);
    expect(isRetryableTelegramError(new TelegramApiError("x", 400, 3))).toBe(true);
    expect(isRetryableTelegramError(new TelegramApiError("chat not found", 400, 0))).toBe(false);
    expect(isRetryableTelegramError(new Error("Upload paused"))).toBe(false);
    expect(isTelegramTransportError("nope")).toBe(false);
  });
});

describe("uploadTelegramChunk", () => {
  it("posts the chunk to the user's own chat and returns the message locator", async () => {
    FakeXHR.replies = [{ kind: "json", status: 200, body: ok(42, "FILE42") }];
    const progress: number[] = [];
    const data = new Uint8Array([1, 2, 3, 4]);

    const locator = await uploadTelegramChunk(target, data, { onProgress: (n) => progress.push(n) });

    expect(locator).toBe("42:FILE42");
    const xhr = FakeXHR.instances[0];
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toBe("https://api.telegram.org/bot123:SECRET/sendDocument");
    const form = xhr.form as FormData;
    expect(form.get("chat_id")).toBe("-100777");
    expect(form.get("disable_notification")).toBe("true");
    const doc = form.get("document") as File;
    expect(doc.name).toMatch(/^[0-9a-f]{16}\.bin$/);
    expect(new Uint8Array(await doc.arrayBuffer())).toEqual(data);
    expect(progress).toEqual([4]);
  });

  it("sends a large chunk as numbered parts and joins their locators in order", async () => {
    FakeXHR.replies = [
      { kind: "json", status: 200, body: ok(1, "A") },
      { kind: "json", status: 200, body: { ok: true, result: { message_id: 2 } } },
    ];
    const progress: number[] = [];
    const data = new Uint8Array(TELEGRAM_MAX_PART_SIZE + 3);

    const locator = await uploadTelegramChunk(target, data, { onProgress: (n) => progress.push(n) });

    expect(locator).toBe("1:A,2:");
    const names = FakeXHR.instances.map((x) => ((x.form as FormData).get("document") as File).name);
    expect(names[0]).toMatch(/^[0-9a-f]{16}\.bin\.p0$/);
    expect(names[1]).toBe(names[0].replace(/\.p0$/, ".p1"));
    expect(progress).toEqual([TELEGRAM_MAX_PART_SIZE, TELEGRAM_MAX_PART_SIZE + 3]);
  });

  it("waits out Telegram's retry_after before trying again", async () => {
    FakeXHR.replies = [
      {
        kind: "json",
        status: 429,
        body: { ok: false, description: "Too Many Requests", parameters: { retry_after: 5 } },
      },
      { kind: "json", status: 200, body: ok(7, "B") },
    ];
    const pending = uploadTelegramChunk(target, new Uint8Array([1]));
    await vi.advanceTimersByTimeAsync(4999);
    expect(FakeXHR.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe("7:B");
    expect(FakeXHR.instances).toHaveLength(2);
  });

  it("backs off 2s, 4s, 8s on transport failures and then gives up", async () => {
    FakeXHR.replies = Array.from({ length: 4 }, () => ({ kind: "network" }) as Reply);
    const pending = uploadTelegramChunk(target, new Uint8Array([1]));
    const settled = pending.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000);
    expect(await settled).toBeInstanceOf(TypeError);
    expect(FakeXHR.instances).toHaveLength(4);
  });

  it("fails fast on a transport failure when asked to", async () => {
    FakeXHR.replies = [{ kind: "network" }];
    await expect(
      uploadTelegramChunk(target, new Uint8Array([1]), { failFastOnTransport: true }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(FakeXHR.instances).toHaveLength(1);
  });

  it("still retries a server error when failing fast on transport", async () => {
    FakeXHR.replies = [
      { kind: "json", status: 500, body: { ok: false, description: "Internal Server Error" } },
      { kind: "json", status: 200, body: ok(3, "C") },
    ];
    const pending = uploadTelegramChunk(target, new Uint8Array([1]), { failFastOnTransport: true });
    await vi.advanceTimersByTimeAsync(2000);
    await expect(pending).resolves.toBe("3:C");
  });

  it("does not retry a refusal such as a missing chat", async () => {
    FakeXHR.replies = [{ kind: "json", status: 400, body: { ok: false } }];
    const err = await uploadTelegramChunk(target, new Uint8Array([1])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TelegramApiError);
    expect((err as TelegramApiError).message).toBe("sendDocument failed: 400");
    expect((err as TelegramApiError).status).toBe(400);
    expect(FakeXHR.instances).toHaveLength(1);
  });

  it("reports an unreadable answer without retrying", async () => {
    FakeXHR.replies = [{ kind: "raw", status: 502, text: "<html>Bad Gateway</html>" }];
    const err = await uploadTelegramChunk(target, new Uint8Array([1])).catch((e: unknown) => e);
    expect((err as TelegramApiError).status).toBe(502);
    expect((err as Error).message).toMatch(/unreadable/);
  });

  it("aborts a stalled transfer and retries it", async () => {
    FakeXHR.replies = [{ kind: "hang" }, { kind: "json", status: 200, body: ok(9, "D") }];
    const pending = uploadTelegramChunk(target, new Uint8Array([1]));
    await vi.advanceTimersByTimeAsync(60_000 + 2000);
    await expect(pending).resolves.toBe("9:D");
  });

  it("stops on pause mid-transfer, before sending, and during a backoff", async () => {
    FakeXHR.replies = [{ kind: "hang" }];
    const ctrl = new AbortController();
    const pending = uploadTelegramChunk(target, new Uint8Array([1]), { signal: ctrl.signal });
    ctrl.abort();
    await expect(pending).rejects.toThrow("Upload paused");

    await expect(
      uploadTelegramChunk(target, new Uint8Array([1]), { signal: ctrl.signal }),
    ).rejects.toThrow("Upload paused");

    FakeXHR.replies = [{ kind: "network" }];
    const later = new AbortController();
    const backoff = uploadTelegramChunk(target, new Uint8Array([1]), { signal: later.signal });
    const settled = backoff.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1000);
    later.abort();
    expect(((await settled) as Error).message).toBe("Upload paused");
  });

  it("labels an abort it did not cause", async () => {
    FakeXHR.replies = [{ kind: "hang" }];
    const pending = uploadTelegramChunk(target, new Uint8Array([1]), { failFastOnTransport: true });
    await Promise.resolve();
    FakeXHR.instances[0].abort();
    await expect(pending).rejects.toThrow("Upload aborted");
  });
});
