export type DeviceKind = "phone" | "desktop" | "unknown";

export interface DeviceSummary {
  browser: string;
  os: string;
  kind: DeviceKind;
}

/** Best-effort browser, OS and form factor from a user agent string. */
export function describeUserAgent(ua: string): DeviceSummary {
  if (!ua) return { browser: "Unknown", os: "Unknown", kind: "unknown" };

  let browser = "Unknown";
  if (ua.includes("Firefox/")) browser = "Firefox";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  else if (ua.includes("Safari/")) browser = "Safari";
  else if (ua.includes("zcrypt")) browser = "zcrypt app";

  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
  else if (ua.includes("Mac OS X")) os = "macOS";
  else if (ua.includes("Linux")) os = "Linux";

  const kind: DeviceKind =
    os === "Android" || os === "iOS" ? "phone" : os === "Unknown" ? "unknown" : "desktop";
  return { browser, os, kind };
}

/** Short "Browser · OS" label for a table cell. */
export function parseUserAgent(ua: string): string {
  if (!ua) return "Unknown";
  const { browser, os } = describeUserAgent(ua);
  return `${browser} · ${os}`;
}
