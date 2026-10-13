import { describe, it, expect } from "vitest";
import { pageMetadata } from "@/lib/page-metadata";
import { SITE_URL } from "@/lib/site";

const base = { title: "FAQ · Docs", description: "Common questions", path: "/docs/faq" };

describe("pageMetadata", () => {
  it("keeps the title bare so the layout template adds the brand once", () => {
    expect(pageMetadata(base).title).toBe("FAQ · Docs");
  });

  it("uses an absolute title when asked", () => {
    const meta = pageMetadata({ ...base, absolute: true });
    expect(meta.title).toEqual({ absolute: "FAQ · Docs" });
    expect(meta.openGraph?.title).toBe("FAQ · Docs");
  });

  it("builds the canonical and OG url from the site origin and path", () => {
    const meta = pageMetadata(base);
    expect(meta.alternates?.canonical).toBe(`${SITE_URL}/docs/faq`);
    expect(meta.openGraph?.url).toBe(`${SITE_URL}/docs/faq`);
  });

  it("suffixes the OG title with the brand and mirrors it on the twitter card", () => {
    const meta = pageMetadata(base);
    expect(meta.openGraph?.title).toBe("FAQ · Docs | zcrypt");
    expect(meta.openGraph?.description).toBe("Common questions");
    expect(meta.twitter).toEqual({
      card: "summary_large_image",
      title: "FAQ · Docs | zcrypt",
      description: "Common questions",
    });
  });

  it("lets OG and twitter copy be overridden independently", () => {
    const meta = pageMetadata({
      ...base,
      ogTitle: "OG title",
      ogDescription: "OG desc",
      twitterTitle: "X title",
      twitterDescription: "X desc",
      ogType: "article",
    });
    expect(meta.openGraph).toMatchObject({
      title: "OG title",
      description: "OG desc",
      type: "article",
    });
    expect(meta.twitter).toMatchObject({ title: "X title", description: "X desc" });
  });

  it("only includes keywords and the feed link when given", () => {
    expect(pageMetadata(base).keywords).toBeUndefined();
    expect(pageMetadata(base).alternates).not.toHaveProperty("types");
    const meta = pageMetadata({ ...base, keywords: ["a"], feedPath: "/feed.xml" });
    expect(meta.keywords).toEqual(["a"]);
    expect(meta.alternates?.types).toEqual({ "application/rss+xml": `${SITE_URL}/feed.xml` });
  });
});
