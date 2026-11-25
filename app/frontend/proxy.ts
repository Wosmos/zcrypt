import { type NextRequest, NextResponse } from "next/server";

// Cloudflare sets these on every request it receives, overwriting anything the
// caller sent, and the Worker copies them for the backend under its own names.
const VISITOR_HEADERS: [from: string, to: string][] = [
  ["cf-connecting-ip", "X-Zcrypt-Visitor-IP"],
  ["cf-ipcountry", "X-Zcrypt-Visitor-Country"],
  ["cf-region-code", "X-Zcrypt-Visitor-Region"],
  ["cf-ipcity", "X-Zcrypt-Visitor-City"],
];

const onCloudflare = () =>
  typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

// The /api rewrite forwards native-app calls to the backend. The shared secret
// lets the backend trust who the caller is: X-Vercel-Forwarded-For on Vercel,
// and the X-Zcrypt-Visitor-* headers set here on Cloudflare.
export function proxy(request: NextRequest) {
  const secret = process.env.ZCRYPT_PROXY_SECRET;
  if (!secret) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set("X-Zcrypt-Proxy-Secret", secret);
  const cloudflare = onCloudflare();
  for (const [from, to] of VISITOR_HEADERS) {
    const value = cloudflare ? request.headers.get(from) : null;
    if (value) headers.set(to, value);
    else headers.delete(to);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/:path*" };
