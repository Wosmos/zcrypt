/**
 * Sealed previews (`th1`, docs/CRYPTO_FORMAT.md 2.4). A grid preview is a
 * ~300px WebP the client renders; it is sealed with the file's own key so the
 * server stores it without being able to see it, and any device that can open
 * the file can open its preview without downloading the original.
 *
 *   plain  = u32 big-endian length || webp || zero padding to the next 8 KiB
 *   sealed = AES-GCM(fileKey, plain, aad = "zcrypt-thumb-v1")      (section 3 wire)
 *
 * Padding hides the preview's exact size; the AAD keeps a sealed preview and a
 * file chunk (same key) from ever being swapped for one another.
 */
import { decryptChunk, encryptChunk } from "@/lib/crypto";

export const THUMB_BUCKET = 8 * 1024;
/** Largest padded preview, so a sealed one fits the server's 64 KiB limit. */
export const THUMB_MAX_PLAIN = 60 * 1024;
const THUMB_AAD = new TextEncoder().encode("zcrypt-thumb-v1");

/** Length-prefix and pad a preview, or null when it is too large to store. */
export function padThumb(webp: Uint8Array): Uint8Array | null {
  const needed = 4 + webp.length;
  const size = Math.ceil(needed / THUMB_BUCKET) * THUMB_BUCKET;
  if (size > THUMB_MAX_PLAIN) return null;
  const out = new Uint8Array(size);
  new DataView(out.buffer).setUint32(0, webp.length);
  out.set(webp, 4);
  return out;
}

export function unpadThumb(plain: Uint8Array): Uint8Array {
  if (plain.length < 4) throw new Error("preview too short");
  const len = new DataView(plain.buffer, plain.byteOffset, plain.byteLength).getUint32(0);
  if (len > plain.length - 4) throw new Error("preview length out of range");
  return plain.slice(4, 4 + len);
}

/** Seal a preview with the file's key, or null when it is too large to store. */
export async function sealThumb(key: ArrayBuffer, webp: Uint8Array): Promise<Uint8Array | null> {
  const plain = padThumb(webp);
  return plain ? encryptChunk(key, plain, THUMB_AAD) : null;
}

export async function openThumb(key: ArrayBuffer, sealed: Uint8Array): Promise<Uint8Array> {
  return unpadThumb(await decryptChunk(key, sealed, THUMB_AAD));
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export function bytesToDataUrl(bytes: Uint8Array, mime = "image/webp"): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mime};base64,${btoa(s)}`;
}
