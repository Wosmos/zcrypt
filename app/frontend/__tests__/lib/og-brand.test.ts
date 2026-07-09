import { describe, it, expect } from "vitest";
import { renderBrandOgCard, OG_SIZE, OG_ALT } from "@/lib/og-brand";

describe("og-brand constants", () => {
  it("exports the standard 1200x630 OG card size", () => {
    expect(OG_SIZE).toEqual({ width: 1200, height: 630 });
  });

  it("exports a descriptive alt string", () => {
    expect(typeof OG_ALT).toBe("string");
    expect(OG_ALT).toMatch(/zcrypt/i);
  });
});

describe("renderBrandOgCard", () => {
  // NOTE: we intentionally do NOT await res.arrayBuffer() — that triggers the
  // heavy satori/resvg render. Constructing the ImageResponse already executes
  // the JSX builder, which is what we're covering.
  function assertImageResponse(res: unknown) {
    expect(res).toBeTruthy();
    const r = res as { arrayBuffer?: unknown; headers?: unknown };
    expect(typeof r.arrayBuffer).toBe("function");
    expect(r.headers).toBeDefined();
  }

  it("renders the default (opengraph) variant", () => {
    assertImageResponse(renderBrandOgCard());
  });

  it("renders the explicit opengraph variant (spaced styling)", () => {
    assertImageResponse(renderBrandOgCard({ variant: "opengraph" }));
  });

  it("renders the twitter variant (non-spaced styling)", () => {
    assertImageResponse(renderBrandOgCard({ variant: "twitter" }));
  });
});
