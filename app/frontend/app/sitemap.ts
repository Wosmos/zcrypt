import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://zcrypt.cloud";

  return [
    {
      url: baseUrl,
      lastModified: "2026-03-18",
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/pricing`,
      lastModified: "2026-03-18",
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/tui`,
      lastModified: "2026-03-18",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/docs`,
      lastModified: "2026-03-18",
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${baseUrl}/docs/getting-started`,
      lastModified: "2026-03-18",
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/docs/security`,
      lastModified: "2026-03-18",
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/docs/platform-adapters`,
      lastModified: "2026-03-18",
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/philosophy`,
      lastModified: "2026-03-18",
      changeFrequency: "yearly",
      priority: 0.6,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: "2026-03-18",
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: "2026-03-18",
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: "2026-03-18",
      changeFrequency: "yearly",
      priority: 0.4,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: "2026-03-18",
      changeFrequency: "yearly",
      priority: 0.4,
    },
  ];
}
