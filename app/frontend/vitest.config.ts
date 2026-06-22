import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["__tests__/**/*.test.{ts,tsx}"],
    // PBKDF2 (600k iterations) and 1MB AES-GCM are CPU-heavy, and v8 coverage
    // instrumentation slows them further — enough to blow the 5s default on
    // slower machines and CI runners. Give crypto tests generous headroom.
    testTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
