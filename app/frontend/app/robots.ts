import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

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
          "/_dev/",
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
          "/_dev/",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
