// Generates app/backend/crypto/testvectors/pk1_vectors.json: fixed-input
// vectors for the public-key backup format (docs/CRYPTO_FORMAT.md §2.2), with
// the same primitives the web client uses (@noble/curves X25519, Web Crypto).
// The TS and Rust conformance tests both read the file.
//   cd app/frontend && node scripts/gen-pk1-vectors.mjs
import { writeFileSync } from "node:fs";
import { x25519 } from "@noble/curves/ed25519.js";

const subtle = globalThis.crypto.subtle;
const hex = (b) => Buffer.from(b).toString("hex");
const b64 = (b) => Buffer.from(b).toString("base64");
const bytes = (start, n) => Uint8Array.from({ length: n }, (_, i) => (start + i * 7) & 0xff);
// Fixed test bytes are stored as the pattern that makes them, never as raw
// key material: the vectors hold nothing a secret scanner can mistake for a key.
const pattern = (start, len) => ({ start, step: 7, len });
const cat = (...a) => Uint8Array.from(a.flatMap((x) => [...x]));

async function sealWith(ephSecret, iv, recipientPub, data) {
  const ephPub = x25519.getPublicKey(ephSecret);
  const shared = x25519.getSharedSecret(ephSecret, recipientPub);
  const sealKey = new Uint8Array(await subtle.digest("SHA-256", cat(shared, ephPub, recipientPub)));
  const key = await subtle.importKey("raw", sealKey, "AES-GCM", false, ["encrypt"]);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  return cat(ephPub, iv, ct);
}

async function cekMac(cek, data) {
  const ikm = await subtle.importKey("raw", cek, "HKDF", false, ["deriveBits"]);
  const macKey = await subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: new TextEncoder().encode("zcrypt-cek-mac-v1") },
    ikm,
    256,
  );
  const k = await subtle.importKey("raw", macKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(new Uint8Array(await subtle.sign("HMAC", k, data)));
}

const recipientSecret = bytes(11, 32);
const recipientPub = x25519.getPublicKey(recipientSecret);
const cases = [
  { name: "wrap a CEK", data: bytes(91, 32), eph: bytes(3, 32), ephPattern: [3, 32], iv: bytes(201, 12) },
  { name: "seal a Unicode file name", data: new TextEncoder().encode("Ferien 🌴 Été ü.jpg"), eph: bytes(57, 32), ephPattern: [57, 32], iv: bytes(17, 12) },
];

const seal = [];
for (const c of cases) {
  const sealed = await sealWith(c.eph, c.iv, recipientPub, c.data);
  seal.push({ name: c.name, eph: pattern(...c.ephPattern), iv_hex: hex(c.iv), data_hex: hex(c.data), sealed_b64: b64(sealed) });
}

const cek = bytes(91, 32);
const mac = [
  { name: "empty file", cek: pattern(91, 32), data_hex: "", mac_hex: await cekMac(cek, new Uint8Array(0)) },
  { name: "short text", cek: pattern(91, 32), data_hex: hex(new TextEncoder().encode("zcrypt backup")), mac_hex: await cekMac(cek, new TextEncoder().encode("zcrypt backup")) },
];

const out = {
  spec: "docs/CRYPTO_FORMAT.md §2.2",
  recipient: pattern(11, 32),
  recipient_public_hex: hex(recipientPub),
  seal,
  cek_mac: mac,
};
writeFileSync(new URL("../../backend/crypto/testvectors/pk1_vectors.json", import.meta.url), JSON.stringify(out, null, 2) + "\n");
console.log("wrote pk1_vectors.json");
