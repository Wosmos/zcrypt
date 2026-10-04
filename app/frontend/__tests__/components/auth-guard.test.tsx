import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { AuthUser } from "@/types";

const m = vi.hoisted(() => ({
  replace: vi.fn(),
  refreshSessionToken: vi.fn(),
  tryRefreshToken: vi.fn(),
  getMe: vi.fn(),
  prefetchVault: vi.fn(),
  readCachedUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: m.replace }) }));
vi.mock("@/lib/auth-fetch", () => ({
  refreshSessionToken: m.refreshSessionToken,
  tryRefreshToken: m.tryRefreshToken,
}));
vi.mock("@/lib/auth-api", () => ({ getMe: m.getMe }));
vi.mock("@/store/files", () => ({ prefetchVault: m.prefetchVault }));
vi.mock("@/components/ui/logo-spinner", () => ({
  LogoSpinner: () => <div data-testid="spinner" />,
}));
vi.mock("@/store/auth", async (orig) => ({
  ...(await orig<typeof import("@/store/auth")>()),
  readCachedUser: m.readCachedUser,
}));

import { AuthGuard } from "@/components/auth/auth-guard";
import { useAuthStore } from "@/store/auth";

const user = { id: "u1", email: "a@b.c", username: "a", onboarded_at: "2026-01-01" } as AuthUser;

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
}

function mount() {
  return render(
    <AuthGuard>
      <div data-testid="app" />
    </AuthGuard>,
  );
}

describe("AuthGuard web reload", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshTokenValue: null,
      initialized: false,
    });
    m.prefetchVault.mockResolvedValue(undefined);
    m.readCachedUser.mockReturnValue(null);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("trades the session cookie for a token and shows the app", async () => {
    m.refreshSessionToken.mockImplementation(async () => {
      useAuthStore.getState().setTokens("at", "rt");
      return { token: "at", rejected: false };
    });
    m.getMe.mockResolvedValue(user);
    mount();
    await flush();
    expect(m.getMe).toHaveBeenCalledWith("at");
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(m.replace).not.toHaveBeenCalled();
    expect(m.refreshSessionToken).toHaveBeenCalledTimes(1);
  });

  it("returns to login instead of a blank page when the session ends mid-use", async () => {
    useAuthStore.setState({ user, accessToken: "at", refreshTokenValue: "rt", initialized: true });
    mount();
    await flush();
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(m.replace).not.toHaveBeenCalled();
    act(() => useAuthStore.getState().clearAuth());
    await flush();
    expect(screen.queryByTestId("app")).toBeNull();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
    expect(m.replace).toHaveBeenCalledWith("/login");
  });

  it("sends a rejected session to login", async () => {
    m.refreshSessionToken.mockResolvedValue({ token: null, rejected: true });
    mount();
    await flush();
    expect(m.replace).toHaveBeenCalledWith("/login");
    expect(m.getMe).not.toHaveBeenCalled();
  });

  it("keeps the cached shell on a transient miss and recovers once the network is back", async () => {
    vi.useFakeTimers();
    m.readCachedUser.mockReturnValue(user);
    m.refreshSessionToken.mockResolvedValueOnce({ token: null, rejected: false });
    mount();
    await flush();
    expect(screen.getByTestId("app")).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();

    m.refreshSessionToken.mockResolvedValueOnce({ token: null, rejected: false });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(m.refreshSessionToken).toHaveBeenCalledTimes(2);

    m.refreshSessionToken.mockImplementation(async () => {
      useAuthStore.getState().setTokens("at2", "rt2");
      return { token: "at2", rejected: false };
    });
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    await flush();
    expect(m.refreshSessionToken).toHaveBeenCalledTimes(3);
    expect(useAuthStore.getState().accessToken).toBe("at2");
    expect(m.prefetchVault).toHaveBeenCalled();
    expect(m.replace).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(m.refreshSessionToken).toHaveBeenCalledTimes(3);
  });

  it("fetches the user after recovering when nothing was cached", async () => {
    vi.useFakeTimers();
    m.refreshSessionToken.mockResolvedValueOnce({ token: null, rejected: false });
    mount();
    await flush();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();

    m.getMe.mockResolvedValue(user);
    m.refreshSessionToken.mockImplementation(async () => {
      useAuthStore.getState().setTokens("at3", "rt3");
      return { token: "at3", rejected: false };
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    await flush();
    expect(m.getMe).toHaveBeenCalledWith("at3");
    expect(screen.getByTestId("app")).toBeInTheDocument();
  });

  it("sends a stranded session to login when the retry is rejected", async () => {
    vi.useFakeTimers();
    m.readCachedUser.mockReturnValue(user);
    m.refreshSessionToken.mockResolvedValueOnce({ token: null, rejected: false });
    mount();
    await flush();
    m.refreshSessionToken.mockResolvedValueOnce({ token: null, rejected: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(m.replace).toHaveBeenCalledWith("/login");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("runs one session check at a time", async () => {
    let release: (v: { token: string | null; rejected: boolean }) => void = () => {};
    m.refreshSessionToken.mockReturnValue(
      new Promise((r) => {
        release = r;
      }),
    );
    mount();
    await flush();
    act(() => {
      useAuthStore.setState({ refreshTokenValue: "noise" });
    });
    await flush();
    expect(m.refreshSessionToken).toHaveBeenCalledTimes(1);
    await act(async () => {
      release({ token: null, rejected: true });
    });
    await flush();
    expect(m.replace).toHaveBeenCalledWith("/login");
  });
});
