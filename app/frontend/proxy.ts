import { type NextRequest, NextResponse } from "next/server";

// The /api rewrite forwards native-app calls to the backend. The shared secret
// lets the backend trust X-Vercel-Forwarded-For as the caller's address.
export function proxy(request: NextRequest) {
  const secret = process.env.ZCRYPT_PROXY_SECRET;
  if (!secret) return NextResponse.next();
  const headers = new Headers(request.headers);
  headers.set("X-Zcrypt-Proxy-Secret", secret);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: "/api/:path*" };
