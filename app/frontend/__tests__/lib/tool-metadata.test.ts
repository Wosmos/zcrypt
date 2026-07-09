import { describe, it, expect } from "vitest";
import { toolMetadata } from "@/lib/tool-metadata";

const base = {
  title: "zcrypt Pad",
  description: "Encrypted scratchpad",
  keywords: ["encrypted", "pad"],
  path: "/pad",
};

describe("toolMetadata", () => {
  it("builds the canonical + OG url from the site origin and path", () => {
    const meta = toolMetadata(base);
    expect(meta.alternates?.canonical).toBe("https://zcrypt.cloud/pad");
    expect(meta.openGraph?.url).toBe("https://zcrypt.cloud/pad");
  });

  it("passes title, description, and keywords straight through", () => {
    const meta = toolMetadata(base);
    expect(meta.title).toBe("zcrypt Pad");
    expect(meta.description).toBe("Encrypted scratchpad");
    expect(meta.keywords).toEqual(["encrypted", "pad"]);
  });

  it("defaults the OG/Twitter title & description to the page title & description", () => {
    const meta = toolMetadata(base);
    expect(meta.openGraph?.title).toBe("zcrypt Pad");
    expect(meta.openGraph?.description).toBe("Encrypted scratchpad");
    expect(meta.twitter && "title" in meta.twitter ? meta.twitter.title : undefined).toBe(
      "zcrypt Pad"
    );
  });

  it("uses explicit ogTitle / ogDescription when provided", () => {
    const meta = toolMetadata({
      ...base,
      ogTitle: "Share a secret",
      ogDescription: "One-time encrypted note",
    });
    expect(meta.openGraph?.title).toBe("Share a secret");
    expect(meta.openGraph?.description).toBe("One-time encrypted note");
    const tw = meta.twitter as { title?: string; description?: string };
    expect(tw.title).toBe("Share a secret");
    expect(tw.description).toBe("One-time encrypted note");
  });

  it("uses a summary_large_image Twitter card", () => {
    const meta = toolMetadata(base);
    const tw = meta.twitter as { card?: string };
    expect(tw.card).toBe("summary_large_image");
  });
});
