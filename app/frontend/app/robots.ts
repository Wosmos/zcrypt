import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/demo"],
      disallow: ["/dashboard/", "/api/"],
    },
    sitemap: "https://zpush.io/sitemap.xml",
  };
}
