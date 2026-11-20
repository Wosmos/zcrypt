import { bindings, defineConfig, defineWorker } from "cf/config";
import { createWorkersCacheConfig } from "@vinext/cloudflare/cache/config";

const workersCache = await createWorkersCacheConfig();

export default defineConfig({
  worker: defineWorker({
    ...workersCache,
    name: "zcrypt-web",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-20",
    compatibilityFlags: ["nodejs_compat"],
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ...workersCache.env,
      ASSETS: bindings.assets(),
      VINEXT_KV_CACHE: bindings.kv(),
    },
  }),
});
