import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MARK_SVG_BASE64 } from "@/lib/og-brand-mark";

describe("og-brand-mark", () => {
  it("matches the brand mark in public/, so the OG card never drifts from it", () => {
    const file = readFileSync(join(process.cwd(), "public/brand/zcrypt-mark-dark-bg.svg"));
    expect(Buffer.from(MARK_SVG_BASE64, "base64").equals(file)).toBe(true);
  });
});
