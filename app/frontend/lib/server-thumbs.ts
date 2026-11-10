/**
 * Previews stored on the server, sealed with each file's own key
 * (docs/CRYPTO_FORMAT.md 2.4, lib/thumb-seal.ts). A grid asks for them in
 * batches and opens them locally, so a folder of photos shows in seconds
 * instead of downloading every original. A preview made on this device is
 * sealed and stored, so the next device skips the download too.
 */
import {
  getFileMeta,
  getFileMetas,
  getFileThumbs,
  putFileThumb,
  type FileMetaResponse,
} from "@/lib/api";
import { fromBase64, resolveFileKey } from "@/lib/crypto";
import { cachedResolveCEK } from "@/lib/decrypt-cache";
import { bytesToDataUrl, dataUrlToBytes, openThumb, sealThumb } from "@/lib/thumb-seal";

const BATCH_WAIT_MS = 30;
const BATCH_MAX = 200;

interface Found {
  sealed: Uint8Array;
  meta: FileMetaResponse;
}

let waiting = new Map<string, ((found: Found | null) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;
// Set when the server has no preview routes (an older backend): stop asking.
let unsupported = false;

function isMissingRoute(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  return status === 404 || status === 405;
}

async function settle(ids: string[], batch: Map<string, ((found: Found | null) => void)[]>) {
  const found = new Map<string, Found>();
  try {
    const thumbs = await getFileThumbs(ids);
    const have = Object.keys(thumbs);
    if (have.length > 0) {
      for (const meta of await getFileMetas(have)) {
        const sealed = thumbs[meta.id];
        if (sealed) found.set(meta.id, { sealed: fromBase64(sealed), meta });
      }
    }
  } catch (err) {
    if (isMissingRoute(err)) unsupported = true;
  }
  for (const id of ids) {
    const callers = batch.get(id) as ((found: Found | null) => void)[];
    for (const done of callers) done(found.get(id) ?? null);
  }
}

function flush() {
  timer = null;
  const batch = waiting;
  waiting = new Map();
  const ids = [...batch.keys()];
  for (let i = 0; i < ids.length; i += BATCH_MAX) void settle(ids.slice(i, i + BATCH_MAX), batch);
}

function lookup(fileId: string): Promise<Found | null> {
  if (unsupported) return Promise.resolve(null);
  return new Promise((resolve) => {
    const list = waiting.get(fileId);
    if (list) list.push(resolve);
    else waiting.set(fileId, [resolve]);
    timer ??= setTimeout(flush, BATCH_WAIT_MS);
  });
}

function fileKey(meta: FileMetaResponse, folderId: string | null, password: string) {
  return cachedResolveCEK(meta.id, folderId, () =>
    resolveFileKey(password, fromBase64(meta.salt), meta.wrapped_cek),
  );
}

/** The file's stored preview as a data URL, or null when it has none or it
 *  can't be opened (then the caller makes one from the original). Never throws. */
export async function loadServerThumb(
  fileId: string,
  folderId: string | null,
  password: string,
): Promise<string | null> {
  try {
    const found = await lookup(fileId);
    if (!found) return null;
    const key = await fileKey(found.meta, folderId, password);
    return bytesToDataUrl(await openThumb(key, found.sealed));
  } catch {
    return null;
  }
}

/** Seal a preview made on this device and store it. Resolves to whether it
 *  was stored. Never throws. */
export async function publishThumb(
  fileId: string,
  folderId: string | null,
  dataUrl: string,
  password: string,
): Promise<boolean> {
  if (unsupported || !dataUrl.startsWith("data:image/webp")) return false;
  try {
    const meta = await getFileMeta(fileId);
    const key = await fileKey(meta, folderId, password);
    const sealed = await sealThumb(key, dataUrlToBytes(dataUrl));
    if (!sealed) return false;
    await putFileThumb(fileId, sealed);
    return true;
  } catch (err) {
    if (isMissingRoute(err)) unsupported = true;
    return false;
  }
}
