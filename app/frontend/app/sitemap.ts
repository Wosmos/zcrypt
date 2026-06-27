import type { MetadataRoute } from "next";
import { docsNav } from "@/lib/data";

type ChangeFreq = MetadataRoute.Sitemap[number]["changeFrequency"];

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://zcrypt.cloud";
  const lastModified = "2026-06-27";

  const make = (path: string, priority: number, changeFrequency: ChangeFreq) => ({
    url: `${baseUrl}${path}`,
    lastModified,
    changeFrequency,
    priority,
  });

  const staticRoutes = [
    make("", 1, "weekly"),
    make("/download", 0.9, "weekly"),
    make("/features", 0.8, "monthly"),
    make("/tui", 0.8, "monthly"),
    make("/philosophy", 0.6, "yearly"),
    make("/send", 0.7, "monthly"),
    make("/pad", 0.7, "monthly"),
    make("/transfer", 0.7, "monthly"),
    make("/privacy", 0.4, "yearly"),
    make("/terms", 0.4, "yearly"),
    make("/login", 0.3, "yearly"),
    make("/register", 0.4, "yearly"),
  ];

  const featureRoutes = [
    "encrypted-drive",
    "folders",
    "file-viewers",
    "sharing",
    "bring-your-own-storage",
    "encryption",
    "transfers",
    "privacy",
    "apps",
  ].map((s) => make(`/features/${s}`, 0.8, "monthly"));

  const vsRoutes = ["dropbox", "google-drive", "proton-drive"].map((s) =>
    make(`/vs/${s}`, 0.7, "monthly")
  );

  // Docs URLs are derived from the nav (single source of truth) so the sitemap
  // can never drift from the docs that actually exist.
  const docHrefs = Array.from(
    new Set(
      docsNav.flatMap((g) =>
        g.links
          .filter((l) => !l.external && l.href.startsWith("/docs"))
          .map((l) => l.href)
      )
    )
  );
  const docsRoutes = [
    make("/docs", 0.8, "weekly"),
    ...docHrefs.filter((h) => h !== "/docs").map((h) => make(h, 0.6, "monthly")),
  ];

  return [...staticRoutes, ...featureRoutes, ...vsRoutes, ...docsRoutes];
}
