import { TELEGRAM_API_ORIGIN } from "@/lib/config";

/** Largest part sent as one document: the Bot API only lets a bot download files up to 20 MB back. */
export const TELEGRAM_MAX_PART_SIZE = 19 * 1024 * 1024;

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2000;
const STALL_MS = 60_000;
const PAUSED = "Upload paused";

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
  if (err instanceof TypeError) return true;
  return err instanceof Error && /stalled|timed out/i.test(err.message);
}

/** Whether a failed sendDocument is worth another try: transport failures, rate limits, and HTTP 429 or 500. */
export function isRetryableTelegramError(err: unknown): boolean {
  if (err instanceof TelegramApiError) {
    return err.status === 429 || err.status === 500 || err.retryAfter > 0;
  }
  return isTelegramTransportError(err);
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
      reject(new Error(PAUSED));
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
      }, STALL_MS);
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
        new Error(
          paused ? PAUSED : stalled ? "Upload stalled (no progress for 60s)" : "Upload aborted",
        ),
      );
    };
    arm();
    xhr.send(form);
  });
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error(PAUSED));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Options for one chunk push. */
export interface TelegramUploadOptions {
  /** Bytes of this chunk sent so far, across all of its parts. */
  onProgress?: (sent: number) => void;
  /** Pause or cancel: rejects with "Upload paused" and is never retried. */
  signal?: AbortSignal;
  /** Give up on the first transport failure instead of retrying it. */
  failFastOnTransport?: boolean;
}

async function sendWithRetry(
  target: TelegramTarget,
  data: Uint8Array,
  filename: string,
  opts: TelegramUploadOptions,
  onProgress: (sent: number) => void,
): Promise<{ messageId: number; fileId: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const wait = lastErr instanceof TelegramApiError ? lastErr.retryAfter * 1000 : 0;
      await sleep(Math.max(RETRY_BASE_MS * 2 ** (attempt - 1), wait), opts.signal);
    }
    try {
      return await postDocument(target, data, filename, onProgress, opts.signal);
    } catch (err) {
      const fatal =
        !isRetryableTelegramError(err) ||
        (opts.failFastOnTransport === true && isTelegramTransportError(err));
      if (fatal) throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Send one encrypted chunk to the user's own chat with their own bot, the way
 * the server and desktop do: a disguised file name, split into 19 MB parts
 * named "<name>.p<n>" when larger, each retried with 2s/4s/8s backoff on
 * transport failures, rate limits and 500s. Resolves to the stored locator,
 * "msgId:fileId" per part joined by commas.
 */
export async function uploadTelegramChunk(
  target: TelegramTarget,
  data: Uint8Array,
  opts: TelegramUploadOptions = {},
): Promise<string> {
  const name = telegramChunkFilename();
  const ranges = telegramPartRanges(data.byteLength);
  const refs: string[] = [];
  for (const [i, [start, end]] of ranges.entries()) {
    const part = data.subarray(start, end);
    const filename = ranges.length === 1 ? name : `${name}.p${i}`;
    const sent = await sendWithRetry(target, part, filename, opts, (n) =>
      opts.onProgress?.(start + n),
    );
    refs.push(`${sent.messageId}:${sent.fileId}`);
  }
  return refs.join(",");
}
