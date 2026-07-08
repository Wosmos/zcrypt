import type { NextConfig } from "next";

const isTauriExport = process.env.NEXT_OUTPUT_EXPORT === "1";

// ── Content-Security-Policy ──────────────────────────────────────────────
// Defense-in-depth against XSS (the #1 threat once users hold private keys in
// the browser). Rolled out as Report-Only by default so it can never break
// production; set CSP_ENFORCE=1 once a deploy shows no violations in the
// console to switch to enforcing.
//
// Notes:
//  - 'unsafe-inline' in script-src is required because Next injects inline
//    hydration scripts and we can't use per-request nonces here (nonces need
//    middleware, which is incompatible with the Tauri static export). A
//    nonce + 'strict-dynamic' policy is the stronger web-only follow-up.
//  - 'wasm-unsafe-eval' is required by the zstd + sql.js WebAssembly modules.
//  - connect-src must include the cross-origin API + its WebSocket origin
//    (device-to-device transfer) + Vercel analytics.
const apiUrl = process.env.NEXT_PUBLIC_API_URL || "";
const apiWss = apiUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");
const cspValue = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiUrl} ${apiWss} https://va.vercel-scripts.com https://vitals.vercel-insights.com`.replace(/\s+/g, " ").trim(),
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "upgrade-insecure-requests",
].join("; ");
const cspHeaderKey = process.env.CSP_ENFORCE === "1"
  ? "Content-Security-Policy"
  : "Content-Security-Policy-Report-Only";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {},
  // Zero-knowledge: every image the app renders is a client-side blob: object
  // URL or a canvas-generated data: URI holding DECRYPTED plaintext. The Vercel
  // image optimizer can neither fetch those (they only exist in the browser) nor
  // be trusted with plaintext (it's a third-party server — routing previews
  // through it would break the zero-knowledge model). The Tauri static export
  // also has no optimizer. So all `next/image` usage runs unoptimized: it
  // renders a plain <img> under the hood while keeping one consistent image
  // component (and satisfying @next/next/no-img-element).
  images: { unoptimized: true },
  // Keep navigated page segments in the App Router client cache so going
  // back to a page (e.g. Dashboard -> Settings -> Dashboard) is instant and
  // doesn't re-render from the server. Next's default is 0s for dynamic
  // segments, which made revisits feel uncached.
  experimental: {
    staleTimes: { dynamic: 30, static: 180 },
  },
  ...(isTauriExport && { output: "export", distDir: ".next-export" }),
  // headers are ignored in static export mode but don't cause errors
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          // CSP only in production (dev needs eval/ws for HMR). Report-Only by
          // default — flip with CSP_ENFORCE=1 after verifying a deploy.
          ...(process.env.NODE_ENV === "production"
            ? [{ key: cspHeaderKey, value: cspValue }]
            : []),
        ],
      },
    ];
  },
  // rewrites are incompatible with static export
  ...(!isTauriExport && {
    async rewrites() {
      const rules = [
        {
          source: "/install.sh",
          destination:
            "https://raw.githubusercontent.com/Wosmos/zcrypt/main/scripts/install.sh",
        },
      ];
      if (process.env.NODE_ENV === "development") {
        rules.push({
          source: "/api/:path*",
          destination: "http://localhost:8080/api/:path*",
        });
      }
      return rules;
    },
  }),
};

export default nextConfig;
