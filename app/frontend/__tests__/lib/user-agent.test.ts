import { describe, expect, it } from "vitest";
import { describeUserAgent, parseUserAgent } from "@/lib/user-agent";

const UA = {
  chromeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0",
  edgeAndroid:
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36 Edg/120.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile Safari/604.1",
  ipad: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1",
  app: "zcrypt-core/0.1.6",
};

describe("describeUserAgent", () => {
  it.each([
    [UA.chromeWin, { browser: "Chrome", os: "Windows", kind: "desktop" }],
    [UA.safariMac, { browser: "Safari", os: "macOS", kind: "desktop" }],
    [UA.firefoxLinux, { browser: "Firefox", os: "Linux", kind: "desktop" }],
    [UA.edgeAndroid, { browser: "Edge", os: "Android", kind: "phone" }],
    [UA.safariIphone, { browser: "Safari", os: "iOS", kind: "phone" }],
    [UA.ipad, { browser: "Safari", os: "iOS", kind: "phone" }],
    [UA.app, { browser: "zcrypt app", os: "Unknown", kind: "unknown" }],
    ["curl/8.0", { browser: "Unknown", os: "Unknown", kind: "unknown" }],
    ["", { browser: "Unknown", os: "Unknown", kind: "unknown" }],
  ])("%s", (ua, want) => {
    expect(describeUserAgent(ua)).toEqual(want);
  });
});

describe("parseUserAgent", () => {
  it("joins browser and OS", () => {
    expect(parseUserAgent(UA.chromeWin)).toBe("Chrome · Windows");
  });

  it("says Unknown for an empty agent", () => {
    expect(parseUserAgent("")).toBe("Unknown");
  });
});
