#!/usr/bin/env node
/**
 * Fails the build when the Next.js output would cost Vercel quota it shouldn't.
 * Run from app/frontend after `next build`.
 *
 * 1. No route may be stored once per URL: a dynamic route listed in the
 *    prerender manifest with a fallback turns every distinct URL into its own
 *    ISR write, so anyone can burn the quota by requesting random paths.
 * 2. No page may refresh more often than every five minutes.
 * 3. The heaviest prerendered pages stay under a size budget, because every ISR
 *    write and every CDN miss is billed per 8 KB of output.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const NEXT_DIR = join(process.cwd(), ".next");
const MIN_REVALIDATE_SECONDS = 300;
const PAGE_BUDGETS_KB = {
  "/": { raw: 335, gzip: 57 },
  "/download": { raw: 162, gzip: 34 },
};

const manifestPath = join(NEXT_DIR, "prerender-manifest.json");
if (!existsSync(manifestPath)) {
  console.error(`check-vercel-cost: ${manifestPath} not found. Run next build first.`);
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const problems = [];

for (const [route, entry] of Object.entries(manifest.dynamicRoutes ?? {})) {
  if (entry.fallback !== false) {
    problems.push(
      `${route} stores a separate ISR page for every URL. Remove generateStaticParams from its web layout/page or set dynamicParams = false.`,
    );
  }
}

for (const [route, entry] of Object.entries(manifest.routes ?? {})) {
  const seconds = entry.initialRevalidateSeconds;
  if (typeof seconds === "number" && seconds > 0 && seconds < MIN_REVALIDATE_SECONDS) {
    problems.push(`${route} revalidates every ${seconds}s (minimum ${MIN_REVALIDATE_SECONDS}s).`);
  }
}

for (const [route, budget] of Object.entries(PAGE_BUDGETS_KB)) {
  const file = join(NEXT_DIR, "server", "app", route === "/" ? "index.html" : `${route}.html`);
  if (!existsSync(file)) {
    problems.push(`${route}: expected prerendered HTML at ${file}.`);
    continue;
  }
  const raw = statSync(file).size / 1024;
  const gzip = gzipSync(readFileSync(file)).length / 1024;
  const line = `${route}: ${raw.toFixed(1)} KB raw (budget ${budget.raw}), ${gzip.toFixed(1)} KB gzip (budget ${budget.gzip})`;
  console.log(line);
  if (raw > budget.raw || gzip > budget.gzip) problems.push(`${line}. Trim the page or raise the budget on purpose.`);
}

if (problems.length) {
  console.error("\ncheck-vercel-cost failed:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("check-vercel-cost: ok");
