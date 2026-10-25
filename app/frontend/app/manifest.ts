import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "zcrypt",
    short_name: "zcrypt",
    description: "Zero-knowledge encrypted cloud drive",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    theme_color: "#090c16",
    background_color: "#090c16",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/brand/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
