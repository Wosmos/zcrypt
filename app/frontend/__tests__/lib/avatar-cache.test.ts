import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { clearAvatarCache, invalidateAvatar, loadAvatar } from "@/lib/avatar-cache";

let counter = 0;
const create = vi.fn(() => `blob:${++counter}`);
const revoke = vi.fn();
const blob = () => Promise.resolve(new Blob(["x"]));

beforeEach(() => {
  counter = 0;
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  create.mockClear();
  revoke.mockClear();
  clearAvatarCache();
  revoke.mockClear();
});

afterEach(() => {
  clearAvatarCache();
  vi.unstubAllGlobals();
});

describe("avatar cache", () => {
  it("fetches once per user and version and reuses the object URL", async () => {
    const fetcher = vi.fn(blob);
    const a = await loadAvatar("u1", "v1", fetcher);
    const b = await loadAvatar("u1", "v1", fetcher);
    expect(a).toBe("blob:1");
    expect(b).toBe("blob:1");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("replaces and revokes an older version of the same user's avatar", async () => {
    await loadAvatar("u1", "v1", blob);
    await loadAvatar("u2", "v1", blob);
    const next = await loadAvatar("u1", "v2", blob);
    expect(next).toBe("blob:3");
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:1");
  });

  it("returns null and forgets the entry when the fetch fails, so it can be retried", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("404")).mockImplementation(blob);
    expect(await loadAvatar("u1", "v1", fetcher)).toBeNull();
    expect(await loadAvatar("u1", "v1", fetcher)).toBe("blob:1");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not resurrect a failed entry that was already replaced", async () => {
    let fail!: (e: Error) => void;
    const slow = new Promise<Blob>((_, rej) => (fail = rej));
    const first = loadAvatar("u1", "v1", () => slow);
    const second = loadAvatar("u1", "v2", blob);
    fail(new Error("late"));
    expect(await first).toBeNull();
    expect(await second).toBe("blob:1");
    expect(await loadAvatar("u1", "v2", blob)).toBe("blob:1");
  });

  it("does not hand out a URL for a fetch that finished after invalidation", async () => {
    let done!: (b: Blob) => void;
    const slow = new Promise<Blob>((r) => (done = r));
    const pending = loadAvatar("u1", "v1", () => slow);
    invalidateAvatar("u1");
    done(new Blob(["x"]));
    expect(await pending).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it("invalidates only the given user's avatars", async () => {
    await loadAvatar("u1", "v1", blob);
    await loadAvatar("u2", "v1", blob);
    invalidateAvatar("u1");
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith("blob:1");
    const fetcher = vi.fn(blob);
    expect(await loadAvatar("u2", "v1", fetcher)).toBe("blob:2");
    expect(fetcher).not.toHaveBeenCalled();
    expect(await loadAvatar("u1", "v1", fetcher)).toBe("blob:3");
  });

  it("invalidating a user that is still loading revokes nothing", () => {
    void loadAvatar("u1", "v1", () => new Promise<Blob>(() => {}));
    invalidateAvatar("u1");
    expect(revoke).not.toHaveBeenCalled();
  });

  it("clearAvatarCache revokes every loaded URL", async () => {
    await loadAvatar("u1", "v1", blob);
    await loadAvatar("u2", "v1", blob);
    clearAvatarCache();
    expect(revoke.mock.calls.map((c) => c[0]).sort()).toEqual(["blob:1", "blob:2"]);
  });
});
