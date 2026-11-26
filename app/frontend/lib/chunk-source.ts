import {
  downloadLinkedChunk,
  getChunkLink,
  getFileChunk,
  getFileLocators,
  type ChunkLocator,
} from "@/lib/api";
import { resolveWebDirect, type DirectTarget } from "@/lib/byos-direct";
import { sha256Hex } from "@/lib/crypto";
import { Platform } from "@/lib/platforms";
import { TransferPath } from "@/types";
import {
  downloadTelegramChunk,
  markTelegramUnreachable,
  resetTelegramUnreachable,
  TelegramUnreachableError,
  telegramRecentlyUnreachable,
} from "@/lib/telegram-download";
import { isAbortError } from "@/lib/transport";
import { relayFitsNow, relayShortfall } from "@/lib/relay-gate";
import { waitForTelegram } from "@/lib/transfer-wait";
import { allowanceResetAt, isAllowanceRefusal } from "@/lib/web-transfer-limit";
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

/** Chunks in a row whose platform link fails before links stop for the file. */
export const LINK_FAILURES_BEFORE_OFF = 2;

/** Options for a chunk source that may hold its transfer instead of failing. */
export interface ChunkSourceOptions {
  /** Told how each chunk arrived: straight from the user's storage, through a platform link, or through the server. */
  onPath?: (path: TransferPath, platform?: string) => void;
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
 * The direct sources are resolved once, on the first chunk that gets an answer.
 */
export function createChunkSource(fileId: string, opts: ChunkSourceOptions = {}) {
  let source: Promise<DirectSource | null> | undefined;
  // A failed lookup is not kept, so the next chunk asks again.
  const direct = () =>
    (source ??= resolveDirectSource(fileId).catch(() => {
      source = undefined;
      return null;
    }));
  const fetched = new Set<number>();

  // A chunk with no Telegram route and no working platform link comes through
  // the server. Before the first one, check that every such chunk
  // still to fetch fits the allowance, so a download that cannot finish stops
  // before it spends any. The server still enforces it on every chunk.
  let serverChecked = false;
  const checkServerOnly = async (src: DirectSource | null) => {
    if (serverChecked || !opts.waitKey) return;
    serverChecked = true;
    let chunks: ChunkLocator[];
    try {
      ({ chunks } = await getFileLocators(fileId));
    } catch {
      return;
    }
    let bytes = 0;
    for (const c of chunks) {
      if (!fetched.has(c.index) && !src?.locators.has(c.index)) bytes += c.size;
    }
    const short = await relayShortfall(bytes);
    if (short) throw short;
  };

  // GitHub and Hugging Face chunks are read from a short-lived platform link the
  // server mints, so their bytes skip the server and the allowance. A chunk
  // with no link (409, e.g. a Hugging Face chunk still awaiting its commit) or
  // whose bytes don't match goes through the server on its own. A failed read
  // is retried once with a fresh link; LINK_FAILURES_BEFORE_OFF chunks in a row
  // failing turn links off for the rest of the file, since this network then
  // can't reach the platform.
  let linkFailures = 0;
  const fetchLinked = async (index: number, signal?: AbortSignal) => {
    const link = await getChunkLink(fileId, index, signal);
    if (!link) return null;
    const data = await downloadLinkedChunk(link.url, signal);
    if (link.sha256 && (await sha256Hex(new Uint8Array(data))) !== link.sha256) return null;
    return { data, sha256: link.sha256, compressed: link.compressed };
  };
  const viaLink = async (index: number, signal?: AbortSignal): Promise<ChunkPayload | null> => {
    if (linkFailures >= LINK_FAILURES_BEFORE_OFF) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const payload = await fetchLinked(index, signal);
        if (payload) linkFailures = 0;
        return payload;
      } catch (err) {
        if (isAbortError(err)) throw err;
      }
    }
    linkFailures++;
    return null;
  };

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
            opts.onPath?.(TransferPath.Direct, Platform.Telegram);
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
      if (!loc) {
        const linked = await viaLink(index, signal);
        if (linked) {
          fetched.add(index);
          opts.onPath?.(TransferPath.Link);
          return linked;
        }
        await checkServerOnly(src);
      }
      try {
        const payload = await getFileChunk(fileId, index, signal);
        fetched.add(index);
        opts.onPath?.(TransferPath.Server);
        return payload;
      } catch (err) {
        if (!waitKey || !isAllowanceRefusal(err)) throw err;
        await waitForTelegram(waitKey, WaitReason.AllowanceUsedUp, signal, allowanceResetAt(err));
      }
    }
  };
}
