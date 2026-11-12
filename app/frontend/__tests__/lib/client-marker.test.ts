import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({ API_BASE: "https://api.example.com" }));
vi.mock("@/lib/tauri", () => ({ isTauri: false }));

import {
  CLIENT_HEADER,
  clientMarker,
  clientPlatform,
  installClientMarker,
  isApiRequest,
  resetClientMarkerForTest,
} from "@/lib/client-marker";

describe("clientPlatform", () => {
  it("names the web and each app", () => {
    expect(clientPlatform(false, "anything")).toBe("web");
    expect(clientPlatform(true, "Mozilla/5.0 (Linux; Android 17; wv)")).toBe("android");
    expect(clientPlatform(true, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/157")).toBe(
      "desktop-windows",
    );
    expect(clientPlatform(true, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe(
      "desktop-macos",
    );
    expect(clientPlatform(true, "Mozilla/5.0 (X11; Linux x86_64)")).toBe("desktop-linux");
  });

  it("defaults to this browser", () => {
    expect(clientPlatform()).toBe("web");
  });
});

describe("clientMarker", () => {
  it("joins the platform and version", () => {
    expect(clientMarker("0.2.3")).toBe("web/0.2.3");
  });

  it("falls back to 0 for a missing or odd version", () => {
    expect(clientMarker("")).toBe("web/0");
    expect(clientMarker(undefined)).toBe("web/0");
    expect(clientMarker("bad version!")).toBe("web/0");
  });

  it("reads the app version by default", () => {
    expect(clientMarker()).toMatch(/^web\//);
  });
});

describe("isApiRequest", () => {
  it("matches the site proxy, the API host and same-origin absolute URLs", () => {
    expect(isApiRequest("/api/auth/refresh")).toBe(true);
    expect(isApiRequest("https://api.example.com/api/files")).toBe(true);
    expect(isApiRequest(`${window.location.origin}/api/me`)).toBe(true);
  });

  it("leaves everything else alone", () => {
    expect(isApiRequest("https://api.telegram.org/bot1/sendDocument")).toBe(false);
    expect(isApiRequest("/_next/static/chunk.js")).toBe(false);
    expect(isApiRequest("https://api.example.com/health")).toBe(false);
    expect(isApiRequest("https://api.example.com/api/x", "")).toBe(false);
    expect(isApiRequest("not a url")).toBe(false);
  });
});

describe("installClientMarker", () => {
  const original = window.fetch;
  let spy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    spy = vi.fn(async () => new Response("{}"));
    window.fetch = spy as unknown as typeof fetch;
    resetClientMarkerForTest();
    installClientMarker();
  });

  afterEach(() => {
    window.fetch = original;
    resetClientMarkerForTest();
  });

  const sentHeaders = (call = 0) => new Headers((spy.mock.calls[call][1] as RequestInit).headers);

  it("adds the header to API calls and keeps the caller's headers", async () => {
    await fetch("/api/auth/refresh", { method: "POST", headers: { "Content-Type": "application/json" } });
    expect(sentHeaders().get(CLIENT_HEADER)).toMatch(/^web\//);
    expect(sentHeaders().get("Content-Type")).toBe("application/json");
  });

  it("keeps a header the caller already set", async () => {
    await fetch(new URL("https://api.example.com/api/files"), { headers: { [CLIENT_HEADER]: "android/9" } });
    expect(sentHeaders().get(CLIENT_HEADER)).toBe("android/9");
  });

  it("reads headers from a Request", async () => {
    await fetch(new Request("https://api.example.com/api/files", { headers: { "X-A": "1" } }));
    expect(sentHeaders().get("X-A")).toBe("1");
    expect(sentHeaders().get(CLIENT_HEADER)).toMatch(/^web\//);
  });

  it("passes other requests through untouched", async () => {
    const init = { method: "POST" };
    await fetch("https://api.telegram.org/bot1/sendDocument", init);
    expect(spy.mock.calls[0][1]).toBe(init);
  });

  it("installs once", async () => {
    installClientMarker();
    await fetch("/api/x");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
