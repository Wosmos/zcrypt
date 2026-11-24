import { defineConfig } from "vite";
import vinext from "vinext";
import { cloudflare } from "@cloudflare/vite-plugin";
import { kvDataAdapter } from "@vinext/cloudflare/cache/kv-data-adapter";
import { staticAssetsAdapter } from "@vinext/cloudflare/cache/static-assets-adapter";

// Pages are rendered at build time and served from Workers Static Assets, so a
// visit costs ~6 ms of Worker CPU instead of a full render (free plan: 10 ms).
export default defineConfig({
  plugins: [
    vinext({
      prerender: true,
      cache: { data: kvDataAdapter(), cdn: staticAssetsAdapter() },
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
