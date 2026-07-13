import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/api/",
          "/settings/",
          "/analytics/",
          "/admin/",
          "/spaces/",
          "/tools/",
          "/trash/",
          "/share/",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/api/",
          "/settings/",
          "/analytics/",
          "/admin/",
          "/spaces/",
          "/tools/",
          "/trash/",
          "/share/",
        ],
      },
    ],
    sitemap: "https://zcrypt.cloud/sitemap.xml",
  };
}
