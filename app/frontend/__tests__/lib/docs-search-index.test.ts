import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/data", () => ({
  docsNav: [
    {
      title: "The Group & Stuff",
      summary: "group summary",
      links: [
        { title: "A Guide, to Setup!", href: "/one", desc: "First entry description" },
        { title: "X", href: "/two", desc: "Second entry description" },
        { title: "Setup Setup Guide", href: "/three", desc: "Third entry description" },
      ],
    },
    {
      title: "Second Group",
      summary: "second summary",
      links: [{ title: "Only Link", href: "/four", desc: "Fourth entry description" }],
    },
  ],
}));

import { docsSearchIndex } from "@/lib/docs-search-index";

describe("docsSearchIndex", () => {
  it("flattens every group's links into one entry each, in order", () => {
    expect(docsSearchIndex).toHaveLength(4);
    expect(docsSearchIndex.map((e) => e.href)).toEqual(["/one", "/two", "/three", "/four"]);
  });

  it("carries title, section, content, and href through unchanged", () => {
    expect(docsSearchIndex[0]).toMatchObject({
      title: "A Guide, to Setup!",
      section: "The Group & Stuff",
      content: "First entry description",
      href: "/one",
    });
  });

  it("lowercases tags, strips punctuation, and drops stopwords", () => {
    // "a guide to setup the group & stuff" -> stopwords "a"/"to"/"the" dropped,
    // "&" stripped by the allow-list regex.
    expect(docsSearchIndex[0].tags).toEqual(["guide", "setup", "group", "stuff"]);
  });

  it("drops single-character tokens even when not a stopword", () => {
    // "x the group & stuff" -> "x" is length 1, "the" is a stopword.
    expect(docsSearchIndex[1].tags).toEqual(["group", "stuff"]);
  });

  it("de-duplicates repeated words within a single entry's tags", () => {
    // "setup setup guide the group & stuff" -> repeated "setup" collapses.
    expect(docsSearchIndex[2].tags).toEqual(["setup", "guide", "group", "stuff"]);
  });

  it("builds tags independently per entry across groups", () => {
    expect(docsSearchIndex[3].tags).toEqual(["only", "link", "second", "group"]);
  });
});
