import { describe, it, expect, vi, afterEach } from "vitest";

type Listener = (e: { data: unknown }) => void;

class FakeChannel {
  static instances: FakeChannel[] = [];
  listeners = new Set<Listener>();
  posted: unknown[] = [];
  constructor(public name: string) {
    FakeChannel.instances.push(this);
  }
  postMessage(m: unknown) {
    this.posted.push(m);
  }
  addEventListener(_t: string, l: Listener) {
    this.listeners.add(l);
  }
  removeEventListener(_t: string, l: Listener) {
    this.listeners.delete(l);
  }
  emit(data: unknown) {
    for (const l of this.listeners) l({ data });
  }
}

async function load() {
  vi.resetModules();
  FakeChannel.instances = [];
  return import("@/lib/auth-sync");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("auth-sync", () => {
  it("broadcasts a rotated pair on one shared channel", async () => {
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const sync = await load();
    sync.broadcastTokens({ accessToken: "a", refreshToken: "r" });
    sync.broadcastTokens({ accessToken: "a2", refreshToken: "r2" });
    expect(FakeChannel.instances).toHaveLength(1);
    expect(FakeChannel.instances[0].name).toBe("zcrypt-auth");
    expect(FakeChannel.instances[0].posted).toEqual([
      { accessToken: "a", refreshToken: "r" },
      { accessToken: "a2", refreshToken: "r2" },
    ]);
  });

  it("hands valid pairs from other tabs to the handler and ignores malformed ones", async () => {
    vi.stubGlobal("BroadcastChannel", FakeChannel);
    const sync = await load();
    const handler = vi.fn();
    const off = sync.onTokensFromOtherTabs(handler);
    const ch = FakeChannel.instances[0];
    ch.emit({ accessToken: "a", refreshToken: "r" });
    ch.emit({ accessToken: 1 });
    ch.emit(null);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ accessToken: "a", refreshToken: "r" });
    off();
    ch.emit({ accessToken: "b", refreshToken: "s" });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("does nothing without BroadcastChannel", async () => {
    vi.stubGlobal("BroadcastChannel", undefined);
    const sync = await load();
    expect(() => sync.broadcastTokens({ accessToken: "a", refreshToken: "r" })).not.toThrow();
    const off = sync.onTokensFromOtherTabs(vi.fn());
    expect(() => off()).not.toThrow();
  });

  it("runs the refresh under a Web Lock when available, and directly when not", async () => {
    const sync = await load();
    const request = vi.fn((_n: string, fn: () => Promise<string>) => fn());
    vi.stubGlobal("navigator", { locks: { request } });
    await expect(sync.withRefreshLock(async () => "ok")).resolves.toBe("ok");
    expect(request).toHaveBeenCalledWith("zcrypt-refresh", expect.any(Function));
    vi.stubGlobal("navigator", {});
    await expect(sync.withRefreshLock(async () => "direct")).resolves.toBe("direct");
    vi.stubGlobal("navigator", undefined);
    await expect(sync.withRefreshLock(async () => "no navigator")).resolves.toBe("no navigator");
  });
});
