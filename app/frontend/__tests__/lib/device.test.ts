import { describe, it, expect, afterEach, vi } from "vitest";
import { getDeviceId } from "@/lib/device";

function makeLocalStorage() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((k: string) => (store.has(k) ? (store.get(k) as string) : null)),
    setItem: vi.fn((k: string, v: string) => {
      store.set(k, v);
    }),
    removeItem: vi.fn((k: string) => store.delete(k)),
    clear: vi.fn(() => store.clear()),
  };
}

describe("getDeviceId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns an empty string when window is undefined (SSR)", () => {
    vi.stubGlobal("window", undefined);
    expect(getDeviceId()).toBe("");
  });

  it("generates a UUID via crypto.randomUUID and persists it when none is stored", () => {
    const localStorage = makeLocalStorage();
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("crypto", { randomUUID: () => "fixed-uuid-1234" });

    const id = getDeviceId();

    expect(id).toBe("fixed-uuid-1234");
    expect(localStorage.setItem).toHaveBeenCalledWith("zcrypt-device-id", "fixed-uuid-1234");
  });

  it("returns the existing id from localStorage without regenerating", () => {
    const localStorage = makeLocalStorage();
    localStorage.getItem.mockReturnValue("existing-id");
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("crypto", { randomUUID: () => "should-not-be-used" });

    const id = getDeviceId();

    expect(id).toBe("existing-id");
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("falls back to a manual dev- id when crypto.randomUUID is unavailable", () => {
    const localStorage = makeLocalStorage();
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("crypto", {});

    const id = getDeviceId();

    expect(id).toMatch(/^dev-\d+-[a-z0-9]+$/);
    expect(localStorage.setItem).toHaveBeenCalledWith("zcrypt-device-id", id);
  });

  it("falls back to a manual dev- id when crypto itself is undefined", () => {
    const localStorage = makeLocalStorage();
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("crypto", undefined);

    const id = getDeviceId();

    expect(id).toMatch(/^dev-\d+-[a-z0-9]+$/);
  });
});
