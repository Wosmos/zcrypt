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

/**
 * Where one file's chunks come from. A chunk stored on the user's own Telegram
 * is read straight from api.telegram.org when this browser can reach it and
 * the bytes match their recorded sha256; every other case, and any direct
 * failure, goes through the server relay. A connect failure makes direct
 * reads skip Telegram for DIRECT_UNREACHABLE_FOR_MS, a slow body does not.
 * The direct sources are resolved once, on the first chunk.
 */
export function createChunkSource(fileId: string) {
  let source: Promise<DirectSource | null> | undefined;
  const direct = () => (source ??= resolveDirectSource(fileId).catch(() => null));

  return async function fetchChunk(index: number, signal?: AbortSignal): Promise<ChunkPayload> {
    if (!telegramRecentlyUnreachable()) {
      const src = await direct();
      const loc = src?.locators.get(index);
      if (src && loc) {
        try {
          const bytes = await downloadTelegramChunk(src.target.telegram, loc.remote_path, signal);
          if (!loc.sha256 || (await sha256Hex(bytes)) === loc.sha256) {
            const data = bytes.buffer.slice(
              bytes.byteOffset,
              bytes.byteOffset + bytes.byteLength,
            ) as ArrayBuffer;
            return { data, sha256: loc.sha256, compressed: loc.compressed };
          }
        } catch (err) {
          if (isAbortError(err)) throw err;
          if (err instanceof TelegramUnreachableError) {
            markTelegramUnreachable();
          }
        }
      }
    }
    return getFileChunk(fileId, index, signal);
  };
}
