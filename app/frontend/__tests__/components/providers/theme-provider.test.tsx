import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { create } from "zustand";

const h = vi.hoisted(() => ({
  getPref: vi.fn(),
  savePref: vi.fn(),
}));

const authStore = vi.hoisted(() => ({ store: null as unknown }));

vi.mock("@/lib/api", () => ({ getDevicePreference: h.getPref, saveDevicePreference: h.savePref }));
vi.mock("@/lib/device", () => ({ getDeviceId: () => "this-device" }));
vi.mock("@/store/auth", async () => {
  const { create: make } = await import("zustand");
  const store = make<{ user: { id: string } | null }>(() => ({ user: null }));
  authStore.store = store;
  return { useAuthStore: store };
});

import { ThemeProvider, useTheme } from "@/components/providers/theme-provider";

type AuthStore = ReturnType<typeof create<{ user: { id: string } | null }>>;
const signIn = (id: string | null) =>
  act(() => (authStore.store as AuthStore).setState({ user: id ? { id } : null }));

let api: ReturnType<typeof useTheme>;
function Probe() {
  api = useTheme();
  return (
    <span data-testid="theme">
      {api.colorTheme}/{api.theme}/{String(api.syncTheme)}
    </span>
  );
}

const shown = () => screen.getByTestId("theme").textContent;
const pref = (over: Record<string, unknown> = {}) => ({
  device_id: "this-device",
  color_theme: "default",
  mode: "system",
  custom_theme: "",
  sync: true,
  saved: true,
  updated_at: "",
  ...over,
});

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  h.savePref.mockImplementation(async (body: Record<string, unknown>) => pref(body));
  signIn(null);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemeProvider accounts", () => {
  it("loads each account's own theme when accounts switch without a reload", async () => {
    h.getPref.mockResolvedValueOnce(pref({ color_theme: "cyberpunk", mode: "dark" }));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    signIn("wasif");
    await waitFor(() => expect(shown()).toBe("cyberpunk/dark/true"));

    signIn(null);
    h.getPref.mockResolvedValueOnce(pref({ color_theme: "caffeine", mode: "light" }));
    signIn("wosmo");
    await waitFor(() => expect(shown()).toBe("caffeine/light/true"));
    expect(h.getPref).toHaveBeenCalledTimes(2);
  });

  it("never hands one account's theme to an account that has none saved", async () => {
    h.getPref.mockResolvedValueOnce(pref({ color_theme: "cyberpunk", mode: "dark" }));
    localStorage.setItem("zcrypt-custom-theme", '{"accent":"#00ffaa","bg":"#101010"}');
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    signIn("wasif");
    await waitFor(() => expect(shown()).toBe("cyberpunk/dark/true"));

    h.getPref.mockResolvedValueOnce(pref({ saved: false }));
    signIn("wosmo");
    await waitFor(() => expect(shown()).toBe("default/system/true"));
    expect(h.savePref).not.toHaveBeenCalled();
    expect(localStorage.getItem("zcrypt-custom-theme")).toBeNull();
    expect(localStorage.getItem("zcrypt-theme-owner")).toBe("wosmo");
  });

  it("keeps the look already on screen for a first sign-in and saves it as the account theme", async () => {
    localStorage.setItem("zcrypt-color-theme", "cyberpunk");
    localStorage.setItem("zcrypt-theme", "dark");
    h.getPref.mockResolvedValueOnce(pref({ saved: false }));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    signIn("wasif");
    await waitFor(() => expect(h.savePref).toHaveBeenCalled());
    expect(h.savePref.mock.calls[0][0]).toMatchObject({
      device_id: "this-device",
      color_theme: "cyberpunk",
      mode: "dark",
      sync: true,
      join: true,
    });
    await waitFor(() => expect(shown()).toBe("cyberpunk/dark/true"));
  });

  it("saves a change with this device's sync choice", async () => {
    h.getPref.mockResolvedValueOnce(pref({ sync: false }));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    signIn("wasif");
    await waitFor(() => expect(shown()).toBe("default/system/false"));
    act(() => api.setColorTheme("cyberpunk"));
    expect(h.savePref).toHaveBeenLastCalledWith(
      expect.objectContaining({ color_theme: "cyberpunk", sync: false, join: false }),
    );
  });
});

describe("ThemeProvider sync", () => {
  async function signedIn(over: Record<string, unknown> = {}) {
    h.getPref.mockResolvedValueOnce(pref(over));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    signIn("wasif");
    await waitFor(() => expect(h.getPref).toHaveBeenCalled());
  }

  it("repaints when another device changes the account theme", async () => {
    await signedIn();
    act(() =>
      api.applyRemotePreference({
        device_id: "phone",
        color_theme: "cyberpunk",
        mode: "light",
        custom_theme: '{"accent":"#00ffaa","bg":"#101010"}',
      }),
    );
    expect(shown()).toBe("cyberpunk/light/true");
    expect(api.customTheme.accent).toBe("#00ffaa");
  });

  it("ignores its own echo, and every push while it keeps its own theme", async () => {
    await signedIn({ sync: false });
    await waitFor(() => expect(shown()).toBe("default/system/false"));
    act(() => api.applyRemotePreference({ device_id: "phone", color_theme: "cyberpunk" }));
    expect(shown()).toBe("default/system/false");
    act(() => api.setSyncTheme(true));
    await waitFor(() => expect(shown()).toBe("default/system/true"));
    act(() => api.applyRemotePreference({ device_id: "this-device", color_theme: "cyberpunk" }));
    expect(shown()).toBe("default/system/true");
  });

  it("turning sync on adopts the account theme", async () => {
    await signedIn({ sync: false });
    h.savePref.mockResolvedValueOnce(pref({ color_theme: "twitter", mode: "dark" }));
    act(() => api.setSyncTheme(true));
    await waitFor(() => expect(shown()).toBe("twitter/dark/true"));
    expect(h.savePref).toHaveBeenLastCalledWith(expect.objectContaining({ sync: true, join: true }));
    expect(localStorage.getItem("zcrypt-theme-sync")).toBe("1");
  });

  it("turning sync off keeps the current look and remembers the choice", async () => {
    await signedIn({ color_theme: "cyberpunk" });
    await waitFor(() => expect(shown()).toBe("cyberpunk/system/true"));
    act(() => api.setSyncTheme(false));
    expect(shown()).toBe("cyberpunk/system/false");
    expect(h.savePref).toHaveBeenLastCalledWith(expect.objectContaining({ sync: false, join: false }));
    expect(localStorage.getItem("zcrypt-theme-sync")).toBe("0");
  });

  it("re-reads the theme on request, and does nothing when signed out", async () => {
    await signedIn();
    h.getPref.mockResolvedValueOnce(pref({ color_theme: "cyberpunk" }));
    act(() => api.reloadPreference());
    await waitFor(() => expect(shown()).toBe("cyberpunk/system/true"));
    signIn(null);
    act(() => api.reloadPreference());
    expect(h.getPref).toHaveBeenCalledTimes(2);
  });

  it("saves a custom palette once the picker settles", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await signedIn();
    act(() => api.setCustomTheme({ accent: "#00ffaa", bg: "#101010" }));
    act(() => api.setCustomTheme({ accent: "#00ffbb", bg: "#101010" }));
    expect(h.savePref).not.toHaveBeenCalled();
    await act(async () => vi.advanceTimersByTimeAsync(1000));
    expect(h.savePref).toHaveBeenCalledTimes(1);
    expect(h.savePref.mock.calls[0][0].custom_theme).toBe('{"accent":"#00ffbb","bg":"#101010"}');
    vi.useRealTimers();
  });

  it("keeps the choice locally when the server is unreachable", async () => {
    h.getPref.mockRejectedValueOnce(new Error("offline"));
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    signIn("wasif");
    await waitFor(() => expect(h.getPref).toHaveBeenCalled());
    h.savePref.mockRejectedValueOnce(new Error("offline"));
    act(() => api.setTheme("dark"));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(localStorage.getItem("zcrypt-theme")).toBe("dark");
  });
});
