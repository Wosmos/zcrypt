import { getFileChunk, getFileLocators, type ChunkLocator } from "@/lib/api";
import { resolveWebDirect, type DirectTarget } from "@/lib/byos-direct";
import { sha256Hex } from "@/lib/crypto";
import { Platform } from "@/lib/platforms";
import {
  downloadTelegramChunk,
  markTelegramUnreachable,
  resetTelegramUnreachable,
  TelegramUnreachableError,
  telegramRecentlyUnreachable,
} from "@/lib/telegram-download";
import { isAbortError } from "@/lib/transport";
import { relayFitsNow } from "@/lib/relay-gate";
import { waitForTelegram } from "@/lib/transfer-wait";
import { isAllowanceRefusal } from "@/lib/web-transfer-limit";
import { WaitReason } from "@/store/transfer-wait";

export interface ChunkPayload {
  data: ArrayBuffer;
  sha256: string;
  compressed: boolean;
}

/** Forget that Telegram was unreachable (tests, and a changed network). */
export function resetDirectDownloadState(): void {
  resetTelegramUnreachable();
}

interface DirectSource {
  target: DirectTarget;
  locators: Map<number, ChunkLocator>;
}

async function resolveDirectSource(fileId: string): Promise<DirectSource | null> {
  const target = await resolveWebDirect(Platform.Telegram);
  if (!target) return null;
  const { chunks } = await getFileLocators(fileId);
  const locators = new Map<number, ChunkLocator>();
  for (const c of chunks) {
    if (c.platform === Platform.Telegram && (!c.account || c.account === target.account)) {
      locators.set(c.index, c);
    }
  }
  return locators.size > 0 ? { target, locators } : null;
}

/** Options for a chunk source that may hold its transfer instead of failing. */
export interface ChunkSourceOptions {
  /**
   * The transfer's row key (`dl:<id>`). With it, a chunk stored on the user's
   * own Telegram that this network cannot reach goes through the server only
   * while the rest of the file fits the transfer allowance; otherwise the
   * transfer waits for Telegram. A server refusal on the allowance waits too.
   * Without it (previews, which have no row to show a wait on) the chunk just
   * goes through the server and the server's answer stands.
   */
  waitKey?: string;
}

/**
 * Where one file's chunks come from. A chunk stored on the user's own Telegram
 * is read straight from api.telegram.org when this browser can reach it and
 * the bytes match their recorded sha256; every other case, and any direct
 * failure, goes through the server. A connect failure makes direct reads skip
 * Telegram for DIRECT_UNREACHABLE_FOR_MS, a slow body does not. When a
 * `waitKey` is given, going through the server needs room in the transfer
 * allowance for the rest of the file, else the transfer waits for Telegram.
 * The direct sources are resolved once, on the first chunk.
 */
export function createChunkSource(fileId: string, opts: ChunkSourceOptions = {}) {
  let source: Promise<DirectSource | null> | undefined;
  const direct = () => (source ??= resolveDirectSource(fileId).catch(() => null));
  const fetched = new Set<number>();

  const restBytes = (src: DirectSource) => {
    let sum = 0;
    for (const [i, loc] of src.locators) if (!fetched.has(i)) sum += loc.size;
    return sum;
  };

  return async function fetchChunk(index: number, signal?: AbortSignal): Promise<ChunkPayload> {
    const src = await direct();
    const loc = src?.locators.get(index);
    const waitKey = src && loc ? opts.waitKey : undefined;
    for (;;) {
      if (src && loc && !telegramRecentlyUnreachable()) {
        try {
          const bytes = await downloadTelegramChunk(src.target.telegram, loc.remote_path, signal);
          if (!loc.sha256 || (await sha256Hex(bytes)) === loc.sha256) {
            const data = bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer;
            fetched.add(index);
            return { data, sha256: loc.sha256, compressed: loc.compressed };
          }
        } catch (err) {
          if (isAbortError(err)) throw err;
          if (err instanceof TelegramUnreachableError) {
            markTelegramUnreachable();
          }
        }
      }
      if (
        waitKey &&
        src &&
        telegramRecentlyUnreachable() &&
        !(await relayFitsNow(restBytes(src), 0))
      ) {
        await waitForTelegram(waitKey, WaitReason.TelegramBlocked, signal);
        continue;
      }
      try {
        const payload = await getFileChunk(fileId, index, signal);
        fetched.add(index);
        return payload;
      } catch (err) {
        if (!waitKey || !isAllowanceRefusal(err)) throw err;
        await waitForTelegram(waitKey, WaitReason.AllowanceUsedUp, signal);
      }
    }
  };
}
