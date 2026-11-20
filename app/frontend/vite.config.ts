import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { workersCacheCdnAdapter } from "@vinext/cloudflare/cache/workers-cache-cdn-adapter";

// Pages are cached at the edge (Workers Cache, free, no storage binding); the
// few revalidated fetches (releases, reviews, download stats) live in KV.
export default defineConfig({
  plugins: [
    vinext({
      cache: { data: kvDataAdapter(), cdn: workersCacheCdnAdapter() },
      react: { compiler: true },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
