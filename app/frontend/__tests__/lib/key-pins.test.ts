import { describe, it, expect, beforeEach, vi } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";

vi.mock("@/lib/api", () => ({ getMyKey: vi.fn(), publishKey: vi.fn() }));

const idb = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  broken: false,
}));
vi.mock("idb-keyval", () => ({
  get: vi.fn(async (k: string) => {
    if (idb.broken) throw new Error("no idb");
    return idb.store.get(k);
  }),
  set: vi.fn(async (k: string, v: unknown) => {
    if (idb.broken) throw new Error("no idb");
    idb.store.set(k, v);
  }),
  del: vi.fn(),
}));

import { checkPeerKey, pinPeerKey, KeyChangedError } from "@/lib/key-pins";
import { keyFingerprint } from "@/lib/keys";
import { toBase64 } from "@/lib/crypto";
import { useAuthStore } from "@/store/auth";

const pub = () => toBase64(x25519.keygen().publicKey);

beforeEach(() => {
  idb.store.clear();
  idb.broken = false;
  useAuthStore.setState({ user: { id: "me" } as never });
});

describe("key pins (trust on first use)", () => {
  it("reports new, then verified after pinning, then changed for a different key", async () => {
    const bytes = x25519.keygen().publicKey;
    const a = toBase64(bytes);
    const first = await checkPeerKey("bob", a);
    expect(first.status).toBe("new");
    expect(first.fingerprint).toBe(await keyFingerprint(bytes));
    expect(idb.store.size).toBe(0);

    await pinPeerKey("bob", a);
    expect((await checkPeerKey("bob", a)).status).toBe("verified");

    const swapped = await checkPeerKey("bob", pub());
    expect(swapped.status).toBe("changed");
    expect(swapped.previous).toBe(first.fingerprint);
  });

  it("scopes pins per signed-in user", async () => {
    const a = pub();
    await pinPeerKey("bob", a);
    useAuthStore.setState({ user: { id: "someone-else" } as never });
    expect((await checkPeerKey("bob", a)).status).toBe("new");
  });

  it("treats unavailable storage as new and never throws", async () => {
    idb.broken = true;
    const a = pub();
    await expect(pinPeerKey("bob", a)).resolves.toBeUndefined();
    expect((await checkPeerKey("bob", a)).status).toBe("new");
  });

  it("does nothing without a signed-in user", async () => {
    useAuthStore.setState({ user: null });
    const a = pub();
    await pinPeerKey("bob", a);
    expect(idb.store.size).toBe(0);
    expect((await checkPeerKey("bob", a)).status).toBe("new");
  });

  it("KeyChangedError carries the details", () => {
    const e = new KeyChangedError("bob", "AAAA", "BBBB");
    expect(e.peerUserId).toBe("bob");
    expect(e.fingerprint).toBe("AAAA");
    expect(e.previous).toBe("BBBB");
    expect(e).toBeInstanceOf(Error);
  });
});
