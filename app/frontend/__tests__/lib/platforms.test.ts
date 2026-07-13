import { describe, it, expect } from "vitest";
import {
  PLATFORMS,
  PLATFORM_BY_ID,
  PLATFORM_NAMES,
  PLATFORM_SHORT,
  PLATFORM_COLORS,
  platformName,
  type PlatformId,
} from "@/lib/platforms";

const IDS: PlatformId[] = ["github", "gitlab", "huggingface", "telegram"];

describe("PLATFORMS", () => {
  it("declares exactly the four supported platforms in order", () => {
    expect(PLATFORMS.map((p) => p.id)).toEqual(IDS);
  });

  it("gives every platform a complete metadata shape", () => {
    for (const p of PLATFORMS) {
      expect(p.name).toBeTruthy();
      expect(p.short).toMatch(/^[A-Z]{2}$/);
      expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(typeof p.iconClass).toBe("string");
      expect(p.scope).toBeTruthy();
      expect(p.tagline).toBeTruthy();
      expect(p.description).toBeTruthy();
      expect(p.capacity).toBeTruthy();
      expect(p.fileLimit).toBeTruthy();
      expect(p.rateInfo).toBeTruthy();
      expect(p.placeholder).toBeTruthy();
      expect(p.tokenUrl).toMatch(/^https?:\/\//);
      expect(p.tokenLabel).toBeTruthy();
    }
  });

  it("locks the canonical per-platform capacities (drift guard)", () => {
    expect(PLATFORM_BY_ID.github.capacity).toBe("10 GB / repo (recommended; no hard cap)");
    expect(PLATFORM_BY_ID.gitlab.capacity).toBe("10 GiB / project (then read-only)");
    expect(PLATFORM_BY_ID.huggingface.capacity).toBe("100 GB / account (shared, not per repo)");
    expect(PLATFORM_BY_ID.telegram.capacity).toBe("Unlimited");
  });
});

describe("derived lookup maps", () => {
  it("PLATFORM_BY_ID resolves each id to its full meta", () => {
    for (const id of IDS) {
      expect(PLATFORM_BY_ID[id].id).toBe(id);
    }
    expect(PLATFORM_BY_ID.huggingface.name).toBe("Hugging Face");
  });

  it("PLATFORM_NAMES / SHORT / COLORS mirror the source array", () => {
    for (const p of PLATFORMS) {
      expect(PLATFORM_NAMES[p.id]).toBe(p.name);
      expect(PLATFORM_SHORT[p.id]).toBe(p.short);
      expect(PLATFORM_COLORS[p.id]).toBe(p.color);
    }
  });
});

describe("platformName", () => {
  it("returns the display name for a known id", () => {
    expect(platformName("github")).toBe("GitHub");
    expect(platformName("telegram")).toBe("Telegram");
  });

  it("falls back to the raw id for an unknown platform", () => {
    expect(platformName("dropbox")).toBe("dropbox");
    expect(platformName("")).toBe("");
  });
});
