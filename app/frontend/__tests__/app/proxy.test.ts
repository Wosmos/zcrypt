import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

// NextResponse.next({ request: { headers } }) carries the rewritten request
// headers as x-middleware-request-<name> on the response.
const forwarded = (res: Response, name: string) =>
  res.headers.get(`x-middleware-request-${name.toLowerCase()}`);

function call(headers: Record<string, string>) {
  return proxy(new NextRequest("https://www.zcrypt.cloud/api/files", { headers }));
}

describe("proxy", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("adds nothing without the proxy secret", () => {
    const res = call({ "cf-connecting-ip": "192.0.2.4" });
    expect(forwarded(res, "X-Zcrypt-Proxy-Secret")).toBeNull();
    expect(forwarded(res, "X-Zcrypt-Visitor-IP")).toBeNull();
  });

  it("on Cloudflare, signs the call and copies Cloudflare's visitor headers", () => {
    vi.stubEnv("ZCRYPT_PROXY_SECRET", "s3cret");
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const res = call({
      "cf-connecting-ip": "192.0.2.4",
      "cf-ipcountry": "PK",
      "cf-ipcity": "Lahore",
    });
    expect(forwarded(res, "X-Zcrypt-Proxy-Secret")).toBe("s3cret");
    expect(forwarded(res, "X-Zcrypt-Visitor-IP")).toBe("192.0.2.4");
    expect(forwarded(res, "X-Zcrypt-Visitor-Country")).toBe("PK");
    expect(forwarded(res, "X-Zcrypt-Visitor-City")).toBe("Lahore");
  });

  it("drops visitor headers a caller sent itself", () => {
    vi.stubEnv("ZCRYPT_PROXY_SECRET", "s3cret");
    vi.stubGlobal("navigator", { userAgent: "Cloudflare-Workers" });
    const res = call({ "X-Zcrypt-Visitor-IP": "6.6.6.6", "X-Zcrypt-Visitor-Country": "US" });
    expect(forwarded(res, "X-Zcrypt-Visitor-IP")).toBeNull();
    expect(forwarded(res, "X-Zcrypt-Visitor-Country")).toBeNull();
  });

  it("off Cloudflare, never trusts cf-* headers a caller could forge", () => {
    vi.stubEnv("ZCRYPT_PROXY_SECRET", "s3cret");
    vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0" });
    const res = call({ "cf-connecting-ip": "6.6.6.6", "X-Zcrypt-Visitor-IP": "6.6.6.6" });
    expect(forwarded(res, "X-Zcrypt-Proxy-Secret")).toBe("s3cret");
    expect(forwarded(res, "X-Zcrypt-Visitor-IP")).toBeNull();
  });
});
