import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard/", "/api/", "/settings/", "/analytics/", "/admin/"],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
        disallow: ["/dashboard/", "/api/", "/settings/", "/analytics/", "/admin/"],
      },
    ],
    sitemap: "https://zcrypt.cloud/sitemap.xml",
  };
}
