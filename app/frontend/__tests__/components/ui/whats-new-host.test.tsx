import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => {
  const state = { tourActive: false, appVersion: null as string | null, isActive: () => false };
  state.isActive = () => state.tourActive;
  return state;
});

vi.mock("@/components/onboarding/tour-provider", () => ({
  useTour: () => ({ isActive: h.isActive }),
}));
vi.mock("@/lib/tauri", () => ({
  isTauri: false,
  getAppVersion: () => Promise.resolve(h.appVersion),
}));
vi.mock("@/store/auth", () => ({
  useAuthStore: (sel: (s: { user: { id: string } }) => unknown) => sel({ user: { id: "u1" } }),
}));

import { WhatsNewHost } from "@/components/ui/whats-new-host";
import { LATEST_RELEASED_VERSION } from "@/lib/changelog";
import { useWhatsNewStore } from "@/store/whats-new";

const KEY = "zcrypt-whats-new:u1";

async function mount() {
  render(<WhatsNewHost />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe("WhatsNewHost", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    h.tourActive = false;
    h.appVersion = null;
    useWhatsNewStore.setState({ open: false, version: null, seen: null });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("only records the version on a first-ever visit", async () => {
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(localStorage.getItem(KEY)).toBe(LATEST_RELEASED_VERSION);
    expect(useWhatsNewStore.getState().open).toBe(false);
  });

  it("opens once after the version changes, then marks it seen", async () => {
    localStorage.setItem(KEY, "0.0.1");
    await mount();
    expect(useWhatsNewStore.getState().open).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(useWhatsNewStore.getState().open).toBe(true);
    expect(localStorage.getItem(KEY)).toBe(LATEST_RELEASED_VERSION);
    cleanup();
    useWhatsNewStore.setState({ open: false });
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(useWhatsNewStore.getState().open).toBe(false);
  });

  it("waits while a guided tour is running", async () => {
    localStorage.setItem(KEY, "0.0.1");
    h.tourActive = true;
    await mount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(useWhatsNewStore.getState().open).toBe(false);
    h.tourActive = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(useWhatsNewStore.getState().open).toBe(true);
  });

  it("shows the latest entry in the dialog", async () => {
    vi.useRealTimers();
    localStorage.setItem(KEY, "0.0.1");
    useWhatsNewStore.setState({ open: false, version: null, seen: null });
    render(<WhatsNewHost />);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 3200));
    });
    expect(await screen.findByText("A tour, a bug button, a tidier vault")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See full changelog" })).toHaveAttribute(
      "href",
      "/changelog",
    );
  });
});
