import { decryptChunk, encryptChunk, fromBase64, toBase64 } from "@/lib/crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const SECRET_BYTES = 10;
const SECRET_CHARS = 16;
const enc = new TextEncoder();
const dec = new TextDecoder();

export interface TransferMeta {
  name: string;
  size: number;
  type: string;
  chunks: number;
}

export interface TransferKeys {
  key: ArrayBuffer;
  confirm: string;
}

function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  return out;
}

export function newPairingSecret(): string {
  return toBase32(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)));
}

export function formatPairingSecret(secret: string): string {
  return secret.match(/.{1,4}/g)?.join("-") ?? "";
}

export function normalizePairingSecret(input: string): string {
  return input
    .toUpperCase()
    .replace(new RegExp(`[^${B32}]`, "g"), "")
    .slice(0, SECRET_CHARS);
}

export function isCompletePairingSecret(secret: string): boolean {
  return secret.length === SECRET_CHARS;
}

export function pairingLink(origin: string, code: string, secret: string): string {
  return `${origin}/transfer?code=${code}#k=${secret}`;
}

export function secretFromHash(hash: string): string {
  const m = /[#&]k=([^&]*)/.exec(hash);
  return m ? normalizePairingSecret(m[1]) : "";
}

async function hkdf(
  secret: string,
  code: string,
  info: string,
  bits: number,
): Promise<ArrayBuffer> {
  const base = await crypto.subtle.importKey("raw", enc.encode(secret), "HKDF", false, [
    "deriveBits",
  ]);
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(code), info: enc.encode(info) },
    base,
    bits,
  );
}

export async function deriveTransferKeys(secret: string, code: string): Promise<TransferKeys> {
  const key = await hkdf(secret, code, "zcrypt-transfer-key-v1", 256);
  const c = new DataView(await hkdf(secret, code, "zcrypt-transfer-confirm-v1", 32));
  const n = (c.getUint32(0) % 1000000).toString().padStart(6, "0");
  return { key, confirm: `${n.slice(0, 3)} ${n.slice(3)}` };
}

const META_AAD = enc.encode("zcrypt-transfer-meta-v1");

function chunkAad(index: number, total: number): Uint8Array {
  return enc.encode(`zcrypt-transfer-chunk-v1|${index}|${total}`);
}

export async function sealMeta(key: ArrayBuffer, meta: TransferMeta): Promise<string> {
  return toBase64(await encryptChunk(key, enc.encode(JSON.stringify(meta)), META_AAD));
}

export async function openMeta(key: ArrayBuffer, sealed: string): Promise<TransferMeta> {
  const raw = JSON.parse(dec.decode(await decryptChunk(key, fromBase64(sealed), META_AAD)));
  const chunks = Number(raw.chunks);
  if (!Number.isInteger(chunks) || chunks < 0) throw new Error("Invalid transfer metadata");
  return { name: String(raw.name), size: Number(raw.size), type: String(raw.type), chunks };
}

export async function sealChunk(
  key: ArrayBuffer,
  index: number,
  total: number,
  plaintext: Uint8Array,
): Promise<string> {
  return toBase64(await encryptChunk(key, plaintext, chunkAad(index, total)));
}

export async function openChunk(
  key: ArrayBuffer,
  index: number,
  total: number,
  payload: string,
): Promise<Uint8Array> {
  if (!Number.isInteger(index) || index < 0 || index >= total) {
    throw new Error("Transfer integrity check failed");
  }
  return decryptChunk(key, fromBase64(payload), chunkAad(index, total));
}

/** Join received chunks, refusing anything missing, extra, or not the size the sender sealed. */
export function assembleTransfer(
  chunks: (Uint8Array | undefined)[],
  meta: TransferMeta,
): Uint8Array<ArrayBuffer> {
  const fail = () => new Error("Transfer integrity check failed");
  if (chunks.length !== meta.chunks) throw fail();
  let total = 0;
  for (let i = 0; i < meta.chunks; i++) {
    const c = chunks[i];
    if (!c) throw fail();
    total += c.byteLength;
  }
  if (total !== meta.size) throw fail();
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks as Uint8Array[]) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
