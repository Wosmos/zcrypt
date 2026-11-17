import { TELEGRAM_API_ORIGIN } from "@/lib/config";
import { isTransientError, retryTransient } from "@/lib/retry";
import { IDLE_TIMEOUT_MS, PausedError, StalledError, withControlTimeout } from "@/lib/transport";

/** Largest part sent as one document: the Bot API only lets a bot download files up to 20 MB back. */
export const TELEGRAM_MAX_PART_SIZE = 19 * 1024 * 1024;

const MAX_RETRIES = 3;

/** One bot posting into one chat, the pair a Telegram token is made of. */
export interface TelegramTarget {
  botToken: string;
  chatId: string;
}

/** A Bot API refusal, carrying the HTTP status and any wait Telegram asked for. */
export class TelegramApiError extends Error {
  status: number;
  retryAfter: number;
  constructor(message: string, status: number, retryAfter: number) {
    super(message);
    this.name = "TelegramApiError";
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

/** Random lowercase hex, `bytes` bytes long. */
export function randomHex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A disguised chunk name, the shape the server and desktop use: 16 hex characters and ".bin". */
export function telegramChunkFilename(): string {
  return `${randomHex(8)}.bin`;
}

/** Byte ranges for the documents one chunk is sent as: one part, or 19 MB parts in order. */
export function telegramPartRanges(length: number): Array<[number, number]> {
  if (length <= TELEGRAM_MAX_PART_SIZE) return [[0, length]];
  const ranges: Array<[number, number]> = [];
  for (let start = 0; start < length; start += TELEGRAM_MAX_PART_SIZE) {
    ranges.push([start, Math.min(start + TELEGRAM_MAX_PART_SIZE, length)]);
  }
  return ranges;
}

/** True when Telegram never answered: offline, blocked, a CORS refusal, or a stalled transfer. */
export function isTelegramTransportError(err: unknown): boolean {
  return err instanceof TypeError || err instanceof StalledError;
}

/** Whether a failed Telegram call is worth another try, by the shared rule:
 *  transport failures, rate limits, 408 and any 5xx. */
export function isRetryableTelegramError(err: unknown): boolean {
  return isTransientError(err);
}

interface Envelope {
  ok?: boolean;
  description?: string;
  parameters?: { retry_after?: number };
  result?: { message_id: number; document?: { file_id?: string } };
}

function parseEnvelope(status: number, body: string): { messageId: number; fileId: string } {
  let env: Envelope;
  try {
    env = JSON.parse(body) as Envelope;
  } catch {
    throw new TelegramApiError(`sendDocument: unreadable response (${status})`, status, 0);
  }
  if (!env.ok || !env.result) {
    const retryAfter = env.parameters?.retry_after ?? 0;
    const message = env.description || `sendDocument failed: ${status}`;
    throw new TelegramApiError(message, status, retryAfter);
  }
  return { messageId: env.result.message_id, fileId: env.result.document?.file_id ?? "" };
}

function postDocument(
  target: TelegramTarget,
  data: Uint8Array,
  filename: string,
  onProgress?: (sent: number) => void,
  signal?: AbortSignal,
): Promise<{ messageId: number; fileId: string }> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new PausedError());
      return;
    }
    const form = new FormData();
    form.append("chat_id", target.chatId);
    form.append("disable_notification", "true");
    form.append("document", new Blob([data as BlobPart]), filename);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${TELEGRAM_API_ORIGIN}/bot${target.botToken}/sendDocument`);
    let stalled = false;
    let paused = false;
    let stallTimer: ReturnType<typeof setTimeout>;
    const onAbort = () => {
      paused = true;
      xhr.abort();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const settle = () => {
      clearTimeout(stallTimer);
      signal?.removeEventListener("abort", onAbort);
    };
    const arm = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        stalled = true;
        xhr.abort();
      }, IDLE_TIMEOUT_MS);
    };
    xhr.upload.onprogress = (e: ProgressEvent) => {
      arm();
      onProgress?.(Math.min(e.loaded, data.byteLength));
    };
    xhr.upload.onload = () => arm();
    xhr.onload = () => {
      settle();
      try {
        resolve(parseEnvelope(xhr.status, xhr.responseText));
      } catch (err) {
        reject(err);
      }
    };
    xhr.onerror = () => {
      settle();
      reject(new TypeError("Network request failed"));
    };
    xhr.onabort = () => {
      settle();
      reject(
        paused
          ? new PausedError()
          : stalled
            ? new StalledError("Upload stalled (no progress for 60s)")
            : new TypeError("Upload aborted"),
      );
    };
    arm();
    xhr.send(form);
  });
}

/** Options for one chunk push. */
export interface TelegramUploadOptions {
  /** Bytes of this chunk sent so far, across all of its parts. */
  onProgress?: (sent: number) => void;
  /** Pause or cancel: rejects with a PausedError and is never retried. */
  signal?: AbortSignal;
  /** Give up on the first transport failure instead of retrying it. */
  failFastOnTransport?: boolean;
}

function sendWithRetry(
  target: TelegramTarget,
  data: Uint8Array,
  filename: string,
  opts: TelegramUploadOptions,
  onProgress: (sent: number) => void,
): Promise<{ messageId: number; fileId: string }> {
  return retryTransient(() => postDocument(target, data, filename, onProgress, opts.signal), {
    signal: opts.signal,
    maxRetries: MAX_RETRIES,
    stopError: () => new PausedError(),
    retryIf: (err) =>
      isRetryableTelegramError(err) &&
      !(opts.failFastOnTransport === true && isTelegramTransportError(err)),
  });
}

/** Parse the message ids out of a stored locator, "msgId:fileId" parts joined by commas. */
export function telegramMessageIds(remotePath: string): number[] {
  return remotePath
    .split(",")
    .map((part) => Number(part.split(":")[0]))
    .filter((n) => Number.isFinite(n) && n > 0);
}

/** Delete one message from the chat, best effort: a failure is swallowed, since
 *  the only cost of a message left behind is a stray file in the user's chat. */
export async function deleteTelegramMessage(
  target: TelegramTarget,
  messageId: number,
): Promise<void> {
  try {
    await withControlTimeout(async (signal) => {
      await fetch(`${TELEGRAM_API_ORIGIN}/bot${target.botToken}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: target.chatId, message_id: messageId }),
        signal,
      });
    });
  } catch {
    /* best effort */
  }
}

/** Delete every part of a stored chunk, best effort. */
export async function deleteTelegramChunk(
  target: TelegramTarget,
  remotePath: string,
): Promise<void> {
  await Promise.all(telegramMessageIds(remotePath).map((id) => deleteTelegramMessage(target, id)));
}

/**
 * Send one encrypted chunk to the user's own chat with their own bot, the way
 * the server and desktop do: a disguised file name, split into 19 MB parts
 * named "<name>.p<n>" when larger, each retried on transient failures. When a
 * later part fails, the parts already sent are deleted so a re-send leaves no
 * orphan in the chat. Resolves to the stored locator, "msgId:fileId" per part
 * joined by commas.
 */
export async function uploadTelegramChunk(
  target: TelegramTarget,
  data: Uint8Array,
  opts: TelegramUploadOptions = {},
): Promise<string> {
  const name = telegramChunkFilename();
  const ranges = telegramPartRanges(data.byteLength);
  const refs: string[] = [];
  const sentIds: number[] = [];
  try {
    for (const [i, [start, end]] of ranges.entries()) {
      const part = data.subarray(start, end);
      const filename = ranges.length === 1 ? name : `${name}.p${i}`;
      const sent = await sendWithRetry(target, part, filename, opts, (n) =>
        opts.onProgress?.(start + n),
      );
      sentIds.push(sent.messageId);
      refs.push(`${sent.messageId}:${sent.fileId}`);
    }
  } catch (err) {
    await Promise.all(sentIds.map((id) => deleteTelegramMessage(target, id)));
    throw err;
  }
  return refs.join(",");
}
