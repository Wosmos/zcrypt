import { TELEGRAM_API_ORIGIN } from "@/lib/config";
import { ApiError } from "@/lib/http-error";
import { retryTransient } from "@/lib/retry";
import { TelegramApiError, type TelegramTarget } from "@/lib/telegram-direct";
import {
  DIRECT_UNREACHABLE_FOR_MS,
  FILE_PATH_TTL_MS,
  fetchIdleBody,
  withControlTimeout,
} from "@/lib/transport";

/** Telegram never answered the request itself: offline, blocked, or refused by CORS. */
export class TelegramUnreachableError extends Error {
  constructor(cause: unknown) {
    super(`Telegram unreachable: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = "TelegramUnreachableError";
  }
}

const FILE_PATH_CACHE_CAP = 4096;
const filePaths = new Map<string, { path: string; at: number }>();

export function clearTelegramFilePaths(): void {
  filePaths.clear();
}

let unreachableUntil = 0;

/** Skip direct Telegram for a while after it proved unreachable. */
export function markTelegramUnreachable(): void {
  unreachableUntil = Date.now() + DIRECT_UNREACHABLE_FOR_MS;
}

export function telegramRecentlyUnreachable(): boolean {
  return Date.now() < unreachableUntil;
}

export function resetTelegramUnreachable(): void {
  unreachableUntil = 0;
}

/** Only a failure of the request itself counts as unreachable: a TypeError from
 *  fetch before any response, never a slow or interrupted body. */
function reachable<T>(call: Promise<T>): Promise<T> {
  return call.catch((err: unknown) => {
    throw err instanceof TypeError ? new TelegramUnreachableError(err) : err;
  });
}

interface GetFileEnvelope {
  ok?: boolean;
  description?: string;
  result?: { file_path?: string };
  parameters?: { retry_after?: number };
}

async function resolveFilePath(
  target: TelegramTarget,
  fileId: string,
  signal?: AbortSignal,
): Promise<string> {
  const hit = filePaths.get(fileId);
  if (hit && Date.now() - hit.at < FILE_PATH_TTL_MS) return hit.path;
  const url = `${TELEGRAM_API_ORIGIN}/bot${target.botToken}/getFile?file_id=${encodeURIComponent(fileId)}`;
  const path = await withControlTimeout(async (s) => {
    const res = await reachable(fetch(url, { signal: s }));
    const text = await res.text();
    let env: GetFileEnvelope = {};
    try {
      env = JSON.parse(text) as GetFileEnvelope;
    } catch {
      /* handled below */
    }
    if (!res.ok || !env.ok || !env.result?.file_path) {
      const retryAfter = env.parameters?.retry_after;
      throw new TelegramApiError(
        env.description || `getFile failed: ${res.status}`,
        res.status,
        typeof retryAfter === "number" && retryAfter > 0 ? retryAfter : 0,
      );
    }
    return env.result.file_path;
  }, signal);
  if (filePaths.size >= FILE_PATH_CACHE_CAP) filePaths.clear();
  filePaths.set(fileId, { path, at: Date.now() });
  return path;
}

async function downloadPart(
  target: TelegramTarget,
  fileId: string,
  signal?: AbortSignal,
): Promise<ArrayBuffer> {
  const fetchPath = async (): Promise<ArrayBuffer> => {
    const path = await resolveFilePath(target, fileId, signal);
    const url = `${TELEGRAM_API_ORIGIN}/file/bot${target.botToken}/${path}`;
    const { body } = await fetchIdleBody(
      (s) => reachable(fetch(url, { signal: s })),
      (res) => Promise.reject(new ApiError(`download failed: ${res.status}`, res.status)),
      { signal },
    );
    return body;
  };
  try {
    return await fetchPath();
  } catch (err) {
    // A cached file_path that Telegram no longer knows is dropped and the
    // lookup repeated once; any other failure drops it for the next attempt.
    filePaths.delete(fileId);
    if (err instanceof ApiError && err.status === 404) return fetchPath();
    throw err;
  }
}

/** "msgId:fileId" parts of a stored Telegram locator, as file ids in order. */
export function telegramFileIds(remotePath: string): string[] {
  return remotePath.split(",").map((part) => {
    const id = part.slice(part.indexOf(":") + 1);
    if (!part.includes(":") || !id) throw new Error(`bad telegram part ref: ${part}`);
    return id;
  });
}

/**
 * Fetch one stored chunk straight from Telegram: getFile, then the file URL,
 * under the idle rule, concatenating its parts in order. Two tries for
 * transient failures; an unreachable Telegram fails at once so the caller can
 * relay. Whether the browser may read /file/bot... cross-origin is unverified.
 */
export async function downloadTelegramChunk(
  target: TelegramTarget,
  remotePath: string,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  const ids = telegramFileIds(remotePath);
  return retryTransient(
    async () => {
      const parts: Uint8Array[] = [];
      let total = 0;
      for (const id of ids) {
        const part = new Uint8Array(await downloadPart(target, id, signal));
        parts.push(part);
        total += part.byteLength;
      }
      if (parts.length === 1) return parts[0];
      const out = new Uint8Array(total);
      let off = 0;
      for (const p of parts) {
        out.set(p, off);
        off += p.byteLength;
      }
      return out;
    },
    { signal, maxRetries: 1 },
  );
}
