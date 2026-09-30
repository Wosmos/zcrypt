/**
 * Magic-byte file type detection for decrypted bytes that arrive without a
 * usable name (public links created before names were sealed into the link).
 * Covers the common formats people share; anything else stays extensionless.
 */

export interface SniffedType {
  ext: string;
  mime: string;
}

const ascii = (bytes: Uint8Array, offset: number, text: string) =>
  bytes.length >= offset + text.length &&
  [...text].every((ch, i) => bytes[offset + i] === ch.charCodeAt(0));

const prefix = (bytes: Uint8Array, sig: number[]) =>
  bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);

const SIGNATURES: (SniffedType & { match: (b: Uint8Array) => boolean })[] = [
  {
    ext: "png",
    mime: "image/png",
    match: (b) => prefix(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  { ext: "jpg", mime: "image/jpeg", match: (b) => prefix(b, [0xff, 0xd8, 0xff]) },
  { ext: "gif", mime: "image/gif", match: (b) => ascii(b, 0, "GIF87a") || ascii(b, 0, "GIF89a") },
  { ext: "webp", mime: "image/webp", match: (b) => ascii(b, 0, "RIFF") && ascii(b, 8, "WEBP") },
  { ext: "pdf", mime: "application/pdf", match: (b) => ascii(b, 0, "%PDF-") },
  { ext: "mp4", mime: "video/mp4", match: (b) => ascii(b, 4, "ftyp") },
  {
    ext: "zip",
    mime: "application/zip",
    match: (b) =>
      prefix(b, [0x50, 0x4b, 0x03, 0x04]) ||
      prefix(b, [0x50, 0x4b, 0x05, 0x06]) ||
      prefix(b, [0x50, 0x4b, 0x07, 0x08]),
  },
];

/** Detect a file's type from its leading bytes, or null when unrecognized. */
export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  const hit = SIGNATURES.find((s) => s.match(bytes));
  return hit ? { ext: hit.ext, mime: hit.mime } : null;
}

/** True when the name ends in a short extension ("a.pdf"), not a dotfile or bare stem. */
export function hasExtension(name: string): boolean {
  return /[^.]\.[a-z0-9]{1,10}$/i.test(name);
}

/**
 * The name to save decrypted bytes under: the real name when it has an
 * extension, otherwise the name (or `fallback`) plus a sniffed extension.
 */
export function resolveDownloadName(
  name: string,
  bytes: Uint8Array,
  fallback = "download",
): string {
  const base = name.trim();
  if (base && hasExtension(base)) return base;
  const sniffed = sniffFileType(bytes);
  const stem = base || fallback;
  return sniffed ? `${stem}.${sniffed.ext}` : stem;
}
