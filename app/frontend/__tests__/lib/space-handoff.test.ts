import { beforeEach, describe, expect, it, vi } from "vitest";
import { x25519 } from "@noble/curves/ed25519.js";

const h = vi.hoisted(() => ({
  complete: vi.fn(async (..._a: unknown[]) => ({})),
  check: vi.fn(async (..._a: unknown[]) => ({ fingerprint: "fp", status: "new" as string })),
  pin: vi.fn(async (..._a: unknown[]) => {}),
  seal: vi.fn(async (..._a: unknown[]) => "SEALED"),
  invalidate: vi.fn(),
  ready: true,
  user: { id: "owner" },
  loadKey: vi.fn(),
  fetchQuery: vi.fn(),
  getVault: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ completeSharedVaultMember: h.complete, getSharedVault: h.getVault }));
vi.mock("@/lib/key-pins", () => ({ checkPeerKey: h.check, pinPeerKey: h.pin }));
vi.mock("@/lib/query-client", () => ({
  queryClient: { invalidateQueries: h.invalidate, fetchQuery: h.fetchQuery },
}));
vi.mock("@/store/auth", () => ({ useAuthStore: { getState: () => ({ user: h.user }) } }));
vi.mock("@/store/keys", () => ({ useKeysStore: { getState: () => ({ ready: h.ready }) } }));
vi.mock("@/lib/spaces", () => ({
  loadSpaceKey: h.loadKey,
  spacePerms: (v: { owner_id: string; role?: string }, id?: string) => ({
    manage: v.owner_id === id || v.role === "admin",
  }),
}));
vi.mock("@/lib/keys", () => ({ sealTo: h.seal }));

import { HANDOFF_BACKOFF_MS, handOffForSpace, handOffPendingKeys, resetHandoffBackoff } from "@/lib/space-handoff";
import { toBase64 } from "@/lib/crypto";
import type { SharedVaultDetail, SharedVaultMember } from "@/types";

const invitee = x25519.keygen();
const member = (over: Partial<SharedVaultMember>): SharedVaultMember => ({
  id: "m",
  vault_id: "s1",
  user_id: "u2",
  role: "viewer",
  status: "pending",
  joined_at: "",
  public_key: toBase64(invitee.publicKey),
  ...over,
});
const detail = (members: SharedVaultMember[], role = "admin"): SharedVaultDetail =>
  ({ id: "s1", owner_id: "owner", role, members, files: [] }) as unknown as SharedVaultDetail;

beforeEach(() => {
  vi.clearAllMocks();
  h.loadKey.mockImplementation(async () => new Uint8Array(32).fill(7));
  vi.useRealTimers();
  resetHandoffBackoff();
  h.ready = true;
  h.user = { id: "owner" };
  h.check.mockResolvedValue({ fingerprint: "fp", status: "new" });
});

describe("handOffPendingKeys", () => {
  it("seals the Space key to a pending member's public key and posts it", async () => {
    const done = await handOffPendingKeys(detail([member({})]));
    expect(done).toBe(1);
    expect(h.complete).toHaveBeenCalledTimes(1);
    const [vaultId, userId, wrapped] = h.complete.mock.calls[0] as [string, string, string];
    expect([vaultId, userId, wrapped]).toEqual(["s1", "u2", "SEALED"]);
    const [sealedTo, sealedKey] = h.seal.mock.calls[0] as [Uint8Array, Uint8Array];
    expect(Array.from(sealedTo)).toEqual(Array.from(invitee.publicKey));
    expect(Array.from(sealedKey)).toEqual(Array(32).fill(7));
    expect(h.pin).toHaveBeenCalledWith("u2", toBase64(invitee.publicKey));
    expect(h.invalidate).toHaveBeenCalled();
  });

  it("skips pending members with no key, active members and changed keys", async () => {
    h.check.mockImplementation(async (id: unknown) => ({
      fingerprint: "fp",
      status: id === "u5" ? "changed" : "new",
    }));
    const done = await handOffPendingKeys(
      detail([
        member({ user_id: "u3", public_key: undefined }),
        member({ user_id: "u4", status: "active" }),
        member({ user_id: "u5" }),
      ]),
    );
    expect(done).toBe(0);
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("does nothing for a member who cannot manage, or while the vault is locked", async () => {
    h.user = { id: "someone" };
    expect(await handOffPendingKeys(detail([member({})], "editor"))).toBe(0);
    h.user = { id: "owner" };
    h.ready = false;
    expect(await handOffPendingKeys(detail([member({})]))).toBe(0);
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("stays silent when the post fails and does not retry inside the backoff", async () => {
    vi.useFakeTimers();
    h.complete.mockRejectedValueOnce(new Error("503"));
    expect(await handOffPendingKeys(detail([member({})]))).toBe(0);
    expect(h.invalidate).not.toHaveBeenCalled();
    expect(await handOffPendingKeys(detail([member({})]))).toBe(0);
    expect(h.complete).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(HANDOFF_BACKOFF_MS + 1);
    expect(await handOffPendingKeys(detail([member({})]))).toBe(1);
  });

  it("backs off a 409 key_rotating the same way", async () => {
    vi.useFakeTimers();
    h.complete.mockRejectedValueOnce(Object.assign(new Error("key_rotating"), { status: 409 }));
    await handOffPendingKeys(detail([member({})]));
    await handOffPendingKeys(detail([member({})]));
    expect(h.complete).toHaveBeenCalledTimes(1);
  });

  it("hands over to each waiting member once", async () => {
    const d = detail([member({ user_id: "a" }), member({ user_id: "b" })]);
    expect(await handOffPendingKeys(d)).toBe(2);
    expect(h.complete.mock.calls.map((c) => c[1])).toEqual(["a", "b"]);
  });
});

describe("handOffPendingKeys with nothing to hand over", () => {
  it("returns 0 without loading the key when the detail has no member list", async () => {
    const noMembers = { id: "s1", owner_id: "owner", role: "admin", files: [] } as unknown as SharedVaultDetail;
    expect(await handOffPendingKeys(noMembers)).toBe(0);
    expect(h.loadKey).not.toHaveBeenCalled();
  });

  it("returns 0 without loading the key when nobody is waiting", async () => {
    expect(await handOffPendingKeys(detail([member({ status: "active" })]))).toBe(0);
    expect(h.loadKey).not.toHaveBeenCalled();
  });

  it("does not hand over twice to a member whose hand-over is still in flight", async () => {
    let finish: (v: object) => void = () => {};
    h.complete.mockImplementationOnce(() => new Promise<object>((r) => (finish = r)));
    const first = handOffPendingKeys(detail([member({})]));
    await vi.waitFor(() => expect(h.complete).toHaveBeenCalledTimes(1));

    expect(await handOffPendingKeys(detail([member({})]))).toBe(0);
    expect(h.complete).toHaveBeenCalledTimes(1);

    finish({});
    expect(await first).toBe(1);
  });
});

describe("handOffPendingKeys when the Space key cannot be loaded", () => {
  it("returns 0 and posts nothing when the key is unavailable", async () => {
    h.loadKey.mockResolvedValueOnce(null);
    expect(await handOffPendingKeys(detail([member({})]))).toBe(0);
    expect(h.complete).not.toHaveBeenCalled();
  });

  it("returns 0 and posts nothing when loading the key throws", async () => {
    h.loadKey.mockRejectedValueOnce(new Error("vault locked"));
    expect(await handOffPendingKeys(detail([member({})]))).toBe(0);
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.invalidate).not.toHaveBeenCalled();
  });
});

describe("handOffForSpace", () => {
  it("fetches the fresh member list uncached and hands the key to the waiting member", async () => {
    h.fetchQuery.mockImplementationOnce(async (opts: { queryFn: () => Promise<unknown> }) => opts.queryFn());
    h.getVault.mockResolvedValueOnce(detail([member({})]));
    await handOffForSpace("s1");
    expect(h.fetchQuery).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ["space", "s1"], staleTime: 0 }),
    );
    expect(h.getVault).toHaveBeenCalledWith("s1");
    expect(h.complete).toHaveBeenCalledWith("s1", "u2", "SEALED");
  });

  it("swallows a failed fetch and hands nothing over", async () => {
    h.fetchQuery.mockRejectedValueOnce(new Error("offline"));
    await expect(handOffForSpace("s1")).resolves.toBeUndefined();
    expect(h.complete).not.toHaveBeenCalled();
  });
});
