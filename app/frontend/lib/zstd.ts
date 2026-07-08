import { ZstdInit } from "@oneidentity/zstd-js/wasm";

/**
 * The single, app-wide zstd codec.
 *
 * `ZstdInit()` (re-)initialises the shared wasm module. Calling it from more than
 * one place — or concurrently — re-initialises that module WHILE another caller
 * is mid-decompress, corrupting its state and throwing
 * "ZSTD_ERROR: Src size is incorrect, error code: -72". (This bit the dashboard:
 * the thumbnail loader called ZstdInit() per file, 3 at a time, re-initialising
 * the wasm out from under the file viewer's decrypt.)
 *
 * The fix: EVERY main-thread caller (file viewer, thumbnails, downloads, bulk,
 * shares, vault actions) goes through this ONE memoized init, so `ZstdInit()`
 * runs exactly once for the page's lifetime. `ZstdStream.decompress` is a
 * synchronous, atomic call on the single JS thread, so once everyone shares one
 * codec, concurrent decompression is safe — calls simply queue, never interleave.
 *
 * NOTE: the crypto Web Worker (`workers/crypto-worker.ts`) runs in its own thread
 * with an isolated wasm instance, so it is intentionally NOT routed through here.
 */

type ZstdCodec = Awaited<ReturnType<typeof ZstdInit>>;

let codecPromise: Promise<ZstdCodec> | null = null;

/** The shared codec, initialised at most once. Await it, then call its methods. */
export function getZstdCodec(): Promise<ZstdCodec> {
  if (!codecPromise) codecPromise = ZstdInit();
  return codecPromise;
}

/** Decompress one complete zstd frame (one stored chunk) via the shared codec. */
export async function zstdDecompress(payload: Uint8Array): Promise<Uint8Array> {
  const codec = await getZstdCodec();
  // Codec unavailable — skip decompression and return the payload unchanged,
  // matching the pre-refactor `compressed && codec` guard the callers used.
  if (!codec) return payload;
  return codec.ZstdStream.decompress(payload);
}

/**
 * Drop the memoized codec so the next getZstdCodec() re-runs ZstdInit() and
 * gets a freshly-initialised wasm. Used to recover if the shared state was ever
 * corrupted (otherwise it would keep throwing -72 until a full page reload).
 */
export function resetZstdCodec(): void {
  codecPromise = null;
}
