import type { NextConfig } from "next";

const isTauriExport = process.env.NEXT_OUTPUT_EXPORT === "1";

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {},
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
