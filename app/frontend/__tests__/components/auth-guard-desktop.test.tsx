import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import type { AuthUser } from "@/types";

const m = vi.hoisted(() => ({
  startSync: vi.fn(),
  getMe: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/lib/tauri", async (orig) => ({
  ...(await orig<typeof import("@/lib/tauri")>()),
  isTauri: true,
  startSync: m.startSync,
  subscribeTokens: async () => () => {},
  endSession: async () => {},
}));
vi.mock("@/lib/desktop-creds", () => ({ pickUpDesktopPlatformCreds: async () => {} }));
vi.mock("@/lib/auth-api", () => ({ getMe: m.getMe }));
vi.mock("@/store/files", () => ({ prefetchVault: async () => {} }));
vi.mock("@/components/ui/logo-spinner", () => ({ LogoSpinner: () => null }));

import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuthStore } from "@/store/auth";

const user = { id: "u1", email: "a@b.c", username: "a", onboarded_at: "2026-01-01" } as AuthUser;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

describe("AuthGuard desktop session", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    m.getMe.mockResolvedValue(user);
    useAuthStore.setState({ user, accessToken: "old-a", refreshTokenValue: "old-r" });
  });
  afterEach(cleanup);

  it("adopts the newer pair the engine holds when the window reopens", async () => {
    m.startSync.mockResolvedValue({ access_token: "eng-a", refresh_token: "eng-r" });
    render(<AuthGuard>app</AuthGuard>);
    await flush();
    expect(m.startSync).toHaveBeenCalledWith(expect.any(String), "old-a", "old-r");
    expect(useAuthStore.getState().refreshTokenValue).toBe("eng-r");
    expect(useAuthStore.getState().accessToken).toBe("eng-a");
  });

  it("keeps its own pair when the engine took it", async () => {
    m.startSync.mockImplementation(async (_url: string, access: string, refresh: string) => ({
      access_token: access,
      refresh_token: refresh,
    }));
    render(<AuthGuard>app</AuthGuard>);
    await flush();
    expect(m.startSync).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().refreshTokenValue).toBe("old-r");
  });
});
