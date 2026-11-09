import { describe, expect, it } from "vitest";
import {
  formatRecoveryKey,
  generateRecoveryKey,
  openRecoveryBlob,
  parseRecoveryKey,
  RecoveryKeyError,
  recoveryKeyTail,
  sealRecoveryBlob,
} from "@/lib/recovery-kit";
import { fromBase64 } from "@/lib/crypto";

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (err) {
    return err instanceof RecoveryKeyError ? err.code : "other";
  }
  return undefined;
}

describe("recovery key text", () => {
  it("is ZCRYPT plus 13 groups of four plus a check group", async () => {
    const text = await formatRecoveryKey(generateRecoveryKey());
    expect(text).toMatch(/^ZCRYPT(-[0-9A-HJKMNP-TV-Z]{4}){14}$/);
    expect(recoveryKeyTail(text)).toBe(text.slice(-4));
  });

  it("encodes 32 bytes as 52 Crockford base32 characters", async () => {
    const text = await formatRecoveryKey(new Uint8Array(32).fill(255));
    const body = text.replace(/-/g, "").slice(6, 58);
    expect(body).toBe(`${"Z".repeat(51)}G`);
    const zero = await formatRecoveryKey(new Uint8Array(32));
    expect(zero.replace(/-/g, "").slice(6, 58)).toBe("0".repeat(52));
  });

  it("derives the check group from the first 4 base32 chars of SHA-256", async () => {
    const key = new Uint8Array(32);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", key));
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const expected = [0, 1, 2, 3]
      .map((i) => {
        const bit = i * 5;
        const byte = Math.floor(bit / 8);
        const word = ((digest[byte] << 8) | (digest[byte + 1] ?? 0)) >>> 0;
        return alphabet[(word >>> (16 - (bit % 8) - 5)) & 31];
      })
      .join("");
    expect(recoveryKeyTail(await formatRecoveryKey(key))).toBe(expected);
  });

  it("round-trips through parse", async () => {
    const key = generateRecoveryKey();
    expect(await parseRecoveryKey(await formatRecoveryKey(key))).toEqual(key);
  });

  it("ignores case, spaces, hyphens and a missing prefix", async () => {
    const key = generateRecoveryKey();
    const text = await formatRecoveryKey(key);
    expect(await parseRecoveryKey(text.toLowerCase())).toEqual(key);
    expect(await parseRecoveryKey(text.replace(/-/g, " "))).toEqual(key);
    expect(await parseRecoveryKey(`  ${text.replace(/-/g, "")}\n`)).toEqual(key);
    expect(await parseRecoveryKey(text.slice("ZCRYPT-".length))).toEqual(key);
  });

  it("maps I and L to 1 and O to 0 the Crockford way", async () => {
    const key = new Uint8Array(32);
    const text = await formatRecoveryKey(key);
    const sloppy = text.replace(/0/g, "O").replace(/^ZCRYPT/, "ZCRYPT");
    expect(await parseRecoveryKey(sloppy)).toEqual(key);

    const ones = new Uint8Array(32);
    ones[0] = 0b00001000;
    const onesText = await formatRecoveryKey(ones);
    expect(onesText.replace(/-/g, "").slice(6, 8)).toBe("10");
    expect(await parseRecoveryKey(onesText.replace(/1/g, "l"))).toEqual(ones);
    expect(await parseRecoveryKey(onesText.replace(/1/g, "I"))).toEqual(ones);
  });

  it("rejects a typo through the check group, before any network call", async () => {
    const text = await formatRecoveryKey(generateRecoveryKey());
    const flip = (s: string) => (s === "A" ? "B" : "A");
    const typo = `${text.slice(0, 8)}${flip(text[8])}${text.slice(9)}`;
    expect(await codeOf(parseRecoveryKey(typo))).toBe("typo");

    const badCheck = `${text.slice(0, -1)}${flip(text.slice(-1))}`;
    expect(await codeOf(parseRecoveryKey(badCheck))).toBe("typo");
  });

  it("rejects wrong lengths and characters outside the alphabet", async () => {
    const text = await formatRecoveryKey(generateRecoveryKey());
    expect(await codeOf(parseRecoveryKey(""))).toBe("length");
    expect(await codeOf(parseRecoveryKey(text.slice(0, -4)))).toBe("length");
    expect(await codeOf(parseRecoveryKey(`${text}ABCD`))).toBe("length");
    expect(await codeOf(parseRecoveryKey(text.replace(/^ZCRYPT-\w/, "ZCRYPT-U")))).toBe("chars");
    expect(await codeOf(parseRecoveryKey(text.replace(/^ZCRYPT/, "ZZZZZZ")))).toBe("chars");
  });
});

describe("recovery blob", () => {
  it("round-trips the passphrase, including non-ASCII", async () => {
    const key = generateRecoveryKey();
    for (const passphrase of ["correct horse battery staple", "pässwörd \u{1F512} 密码"]) {
      const blob = await sealRecoveryBlob(key, passphrase);
      expect(await openRecoveryBlob(key, blob)).toBe(passphrase);
    }
  });

  it("uses the rk1: prefix and the IV || ciphertext || tag layout", async () => {
    const passphrase = "twelve chars";
    const blob = await sealRecoveryBlob(generateRecoveryKey(), passphrase);
    expect(blob.startsWith("rk1:")).toBe(true);
    const raw = fromBase64(blob.slice(4));
    expect(raw.length).toBe(12 + new TextEncoder().encode(passphrase).length + 16);
  });

  it("is randomised per seal", async () => {
    const key = generateRecoveryKey();
    expect(await sealRecoveryBlob(key, "same")).not.toBe(await sealRecoveryBlob(key, "same"));
  });

  it("fails with the wrong key", async () => {
    const blob = await sealRecoveryBlob(generateRecoveryKey(), "secret passphrase");
    expect(await codeOf(openRecoveryBlob(generateRecoveryKey(), blob))).toBe("wrong");
  });

  it("fails on a tampered or malformed blob", async () => {
    const key = generateRecoveryKey();
    const blob = await sealRecoveryBlob(key, "secret passphrase");
    const raw = fromBase64(blob.slice(4));
    raw[raw.length - 1] ^= 1;
    const tampered = `rk1:${btoa(String.fromCharCode(...raw))}`;
    expect(await codeOf(openRecoveryBlob(key, tampered))).toBe("wrong");
    expect(await codeOf(openRecoveryBlob(key, "nope"))).toBe("blob");
    expect(await codeOf(openRecoveryBlob(key, "rk1:***"))).toBe("blob");
  });
});
