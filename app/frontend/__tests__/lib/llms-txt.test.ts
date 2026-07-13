import { describe, it, expect } from "vitest";
import { buildLlmsTxt, entry } from "@/lib/llms-txt";
import { docsNav } from "@/lib/data";

describe("entry", () => {
  it("absolutises a relative href against the site origin", () => {
    expect(entry("Login", "/login", "Sign in.")).toBe(
      "- [Login](https://zcrypt.cloud/login): Sign in."
    );
  });

  it("passes an already-absolute http(s) href through unchanged", () => {
    expect(entry("Ext", "https://example.com/x", "External.")).toBe(
      "- [Ext](https://example.com/x): External."
    );
  });

  it("appends a badge in parentheses when provided", () => {
    expect(entry("Beta feature", "/beta", "New thing.", "Beta")).toBe(
      "- [Beta feature](https://zcrypt.cloud/beta) (Beta): New thing."
    );
  });
});

describe("buildLlmsTxt", () => {
  const out = buildLlmsTxt();

  it("returns the llms.txt header and the top-level sections", () => {
    expect(out.startsWith("# zcrypt")).toBe(true);
    for (const heading of [
      "## How it works",
      "## Key facts",
      "## Documentation",
      "## Features",
      "## Compare",
      "## Product & account",
      "## Company",
    ]) {
      expect(out).toContain(heading);
    }
  });

  it("renders every docs group heading, summary, and link from docsNav", () => {
    for (const group of docsNav) {
      expect(out).toContain(`### ${group.title}`);
      expect(out).toContain(group.summary);
      for (const link of group.links) {
        expect(out).toContain(`[${link.title}](https://zcrypt.cloud${link.href})`);
      }
    }
  });

  it("includes at least one badged docs link rendered with its badge", () => {
    const badged = docsNav.flatMap((g) => g.links).find((l) => l.badge);
    // The fixture is expected to contain badged links; if it ever stops, this
    // guard makes that visible rather than silently skipping the branch.
    expect(badged).toBeTruthy();
    if (badged) expect(out).toContain(`(${badged.badge}): ${badged.desc}`);
  });

  it("renders the static feature/product links as absolute site URLs", () => {
    expect(out).toContain("[Anonymous Send](https://zcrypt.cloud/send)");
    expect(out).toContain("[Bring your own storage](https://zcrypt.cloud/features/bring-your-own-storage)");
  });
});
