import { bindings, defineConfig, defineWorker } from "cf/config";

export default defineConfig({
  worker: defineWorker({
    name: "zcrypt-web",
    entrypoint: "vinext/server/fetch-handler",
    compatibilityDate: "2026-11-20",
    compatibilityFlags: ["nodejs_compat"],
    // Workers Logs and Traces (free plan: 200k log events a day), every request.
    observability: {
      enabled: true,
      headSamplingRate: 1,
      logs: { enabled: true, invocationLogs: true, headSamplingRate: 1 },
      traces: { enabled: true, headSamplingRate: 1 },
    },
    assets: {
      htmlHandling: "none",
      notFoundHandling: "none",
      runWorkerFirst: ["/*", "!/_next/static/*", "!/*/_next/static/*"],
    },
    env: {
      ASSETS: bindings.assets(),
      VINEXT_KV_CACHE: bindings.kv(),
      // Set with the Cloudflare dashboard or CLI, never in the repo. Locally,
      // put them in app/frontend/.dev.vars (gitignored).
      ZCRYPT_PROXY_SECRET: bindings.secret(),
    },
  }),
});
