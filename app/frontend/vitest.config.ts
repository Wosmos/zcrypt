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
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary"],
      // Scope to the logic layers that unit tests actually target. UI
      // components/pages are exercised by Playwright (tests/e2e), not vitest,
      // so including them would drown the signal in 0%-covered view files.
      include: ["lib/**", "hooks/**", "store/**"],
      exclude: ["**/*.d.ts", "**/*.test.{ts,tsx}", "lib/icons.tsx"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
