import { describe, it, expect, vi, beforeEach } from "vitest";

const store = vi.hoisted(() => ({ passphrase: null as string | null, user: null as { id: string } | null }));
vi.mock("@/store/passphrase", () => ({
  usePassphraseStore: { getState: () => ({ getPassphrase: () => store.passphrase }) },
}));
vi.mock("@/store/auth", () => ({
  useAuthStore: { getState: () => ({ user: store.user }) },
}));

import {
  SEALED_PREFIX,
  LOCKED,
  isSealed,
  sealText,
  openText,
  openFields,
  keyFromBytes,
  userNameKey,
  requireNameKey,
} from "@/lib/sealed";

async function freshKey(): Promise<CryptoKey> {
  return keyFromBytes(crypto.getRandomValues(new Uint8Array(32)));
}

describe("sealed metadata", () => {
  beforeEach(() => {
    store.passphrase = null;
    store.user = null;
  });

  it("round-trips text and marks it with the enc1: prefix", async () => {
    const key = await freshKey();
    const sealed = await sealText("Tax docs 2025", key);
    expect(sealed.startsWith(SEALED_PREFIX)).toBe(true);
    expect(sealed).not.toContain("Tax docs");
    expect(await openText(sealed, key)).toBe("Tax docs 2025");
  });

  it("never produces the same ciphertext twice (random IV)", async () => {
    const key = await freshKey();
    expect(await sealText("same", key)).not.toBe(await sealText("same", key));
  });

  it("passes legacy plaintext through untouched, with or without a key", async () => {
    expect(await openText("vacation.zip", null)).toBe("vacation.zip");
    expect(await openText("vacation.zip", await freshKey())).toBe("vacation.zip");
    expect(isSealed("vacation.zip")).toBe(false);
    expect(isSealed("")).toBe(false);
    expect(isSealed(undefined)).toBe(false);
  });

  it("reads as [locked] without a key and with the wrong key", async () => {
    const sealed = await sealText("secret", await freshKey());
    expect(await openText(sealed, null)).toBe(LOCKED);
    expect(await openText(sealed, await freshKey())).toBe(LOCKED);
  });

  it("opens only the requested fields and short-circuits when nothing is sealed", async () => {
    const key = await freshKey();
    const plain = [{ name: "a", label: "b", other: "c" }];
    expect(await openFields(plain, ["name", "label"], key)).toBe(plain); // same reference: no work done
    const items = [{ name: await sealText("Alpha", key), label: "legacy", other: await sealText("x", key) }];
    const [out] = await openFields(items, ["name", "label"], key);
    expect(out.name).toBe("Alpha");
    expect(out.label).toBe("legacy");
    expect(out.other).toBe(items[0].other); // not in the field list → untouched
  });

  it("userNameKey is null while locked and requireNameKey refuses to proceed", async () => {
    expect(await userNameKey()).toBeNull();
    await expect(requireNameKey()).rejects.toThrow(/unlock your vault/i);
  });

  it("userNameKey derives once per (passphrase, user) and re-derives on change", async () => {
    store.user = { id: "u1" };
    store.passphrase = "correct horse";
    const k1 = await userNameKey();
    const k2 = await userNameKey();
    expect(k1).toBe(k2); // memoized promise result
    store.passphrase = "different";
    expect(await userNameKey()).not.toBe(k1);
  });
});
