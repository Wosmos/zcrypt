import { describe, it, expect, vi } from "vitest";

// A small, hand-picked fixture designed so each search term lands on exactly
// one scoring tier (title-exact, title-prefix, tag-exact, tag-prefix,
// content-prefix, section-only) — see searchDocs's scoring ladder in
// lib/docs-search-index.ts.
vi.mock("@/lib/data", () => ({
  featuresNav: [
    {
      title: "Encryption",
      href: "/features/encryption",
      desc: "AES-256-GCM encryption at rest and in transit",
    },
  ],
  docsNav: [
    {
      title: "Getting Started",
      summary: "s1",
      links: [
        {
          title: "Quickstart Guide",
          href: "/docs/getting-started",
          desc: "Create an account and connect storage",
        },
      ],
    },
    {
      title: "For Reference",
      summary: "s2",
      links: [{ title: "Appendix", href: "/docs/appendix", desc: "Extra notes" }],
    },
  ],
}));

import { searchDocs } from "@/lib/docs-search-index";

describe("searchDocs", () => {
  it("returns nothing for an empty or whitespace-only query", () => {
    expect(searchDocs("")).toEqual([]);
    expect(searchDocs("   ")).toEqual([]);
  });

  it("scores an exact title word match highest", () => {
    const results = searchDocs("encryption");
    expect(results.map((r) => r.href)).toEqual(["/features/encryption"]);
  });

  it("matches a title word by prefix", () => {
    const results = searchDocs("quick");
    expect(results.map((r) => r.href)).toEqual(["/docs/getting-started"]);
  });

  it("falls back to an exact tag match when the title doesn't match", () => {
    // "started" is a tag (from the "Getting Started" section) but not part
    // of the title "Quickstart Guide".
    const results = searchDocs("started");
    expect(results.map((r) => r.href)).toEqual(["/docs/getting-started"]);
  });

  it("falls back to a tag-prefix match", () => {
    // "star" prefixes the "started" tag without equaling it, and doesn't
    // prefix any title word either.
    const results = searchDocs("star");
    expect(results.map((r) => r.href)).toEqual(["/docs/getting-started"]);
  });

  it("falls back to a content-word-prefix match", () => {
    // "stor" only prefixes "storage" in the description — not the title or tags.
    const results = searchDocs("stor");
    expect(results.map((r) => r.href)).toEqual(["/docs/getting-started"]);
  });

  it("falls back to a section-only match as the lowest tier", () => {
    // "fo" prefixes the section word "for" ("For Reference"), a stopword
    // that was filtered out of tags — so only the raw section words see it.
    const results = searchDocs("fo");
    expect(results.map((r) => r.href)).toEqual(["/docs/appendix"]);
  });

  it("excludes an entry when any query term matches nothing", () => {
    expect(searchDocs("zzzznomatch")).toEqual([]);
    // AND semantics: one matching term isn't enough if another term fails.
    expect(searchDocs("quick zzzznomatch")).toEqual([]);
  });

  it("requires every term to match (AND), scoring on the combined total", () => {
    const results = searchDocs("quick started");
    expect(results.map((r) => r.href)).toEqual(["/docs/getting-started"]);
  });

  it("ranks higher-scoring entries first and respects the limit", () => {
    // "a" prefixes a title word only for "Appendix" (score 6), and only a
    // content word for the other two entries (score 2 each) — forcing a
    // real multi-result sort with both a clear winner and a tie.
    const all = searchDocs("a");
    expect(all.map((r) => r.href)).toEqual([
      "/docs/appendix",
      "/features/encryption",
      "/docs/getting-started",
    ]);

    const limited = searchDocs("a", 2);
    expect(limited.map((r) => r.href)).toEqual(["/docs/appendix", "/features/encryption"]);
  });
});
