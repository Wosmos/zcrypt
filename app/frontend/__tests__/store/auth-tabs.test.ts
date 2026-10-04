import { describe, it, expect, vi } from "vitest";

const m = vi.hoisted(() => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    },
  });
  return {
    broadcastTokens: vi.fn(),
    handler: null as null | ((t: { accessToken: string; refreshToken: string }) => void),
  };
});

vi.mock("@/lib/auth-sync", () => ({
  broadcastTokens: m.broadcastTokens,
  onTokensFromOtherTabs: (h: typeof m.handler) => {
    m.handler = h;
    return () => {};
  },
}));
vi.mock("@/lib/tauri", async (orig) => ({
  ...(await orig<typeof import("@/lib/tauri")>()),
  isTauri: false,
}));

import { useAuthStore } from "@/store/auth";

describe("auth store across tabs", () => {
  it("shares a rotated pair with the other tabs and adopts theirs while signed in", () => {
    useAuthStore.getState().setTokens("a1", "r1");
    expect(m.broadcastTokens).toHaveBeenCalledWith({ accessToken: "a1", refreshToken: "r1" });

    m.handler?.({ accessToken: "a2", refreshToken: "r2" });
    expect(useAuthStore.getState().accessToken).toBe("a2");
    expect(useAuthStore.getState().refreshTokenValue).toBe("r2");
  });

  it("does not sign a tab back in after it logged out", () => {
    useAuthStore.getState().clearAuth();
    m.handler?.({ accessToken: "a3", refreshToken: "r3" });
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
