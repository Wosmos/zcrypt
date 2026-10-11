import { describe, it, expect } from "vitest";
import { clampPercent, platformUsage, ringTone } from "@/lib/storage-usage";
import type { PlatformStatus, RepoInfo } from "@/types";

const repo = (platform: string, used_bytes: number): RepoInfo => ({
  id: `${platform}-${used_bytes}`,
  platform,
  name: "r",
  url: "",
  used_bytes,
  max_bytes: 1000,
  active: true,
});

const status = (platform: string, connected = true): PlatformStatus => ({ platform, connected });

describe("platformUsage edge cases", () => {
  it("reports a zero share for everyone when nothing is stored", () => {
    const rows = platformUsage([repo("github", 0)], [status("github"), status("gitlab")]);
    expect(rows.map((r) => r.share)).toEqual([0, 0]);
  });

  it("orders equal sizes by platform name", () => {
    const rows = platformUsage([repo("telegram", 10), repo("github", 10)], []);
    expect(rows.map((r) => r.platform)).toEqual(["github", "telegram"]);
  });
});

describe("platformUsage", () => {
  it("sums repos per platform, sorts by size and computes shares", () => {
    const rows = platformUsage(
      [repo("github", 100), repo("telegram", 600), repo("github", 300)],
      [status("github"), status("telegram")],
    );
    expect(rows.map((r) => [r.platform, r.bytes, r.share])).toEqual([
      ["telegram", 600, 0.6],
      ["github", 400, 0.4],
    ]);
  });

  it("lists connected platforms that hold nothing yet", () => {
    const rows = platformUsage([repo("github", 50)], [status("github"), status("gitlab")]);
    expect(rows.find((r) => r.platform === "gitlab")).toMatchObject({
      bytes: 0,
      share: 0,
      connected: true,
    });
  });

  it("keeps data on a disconnected platform visible but flagged", () => {
    const rows = platformUsage([repo("gitlab", 10)], [status("gitlab", false)]);
    expect(rows[0]).toMatchObject({ platform: "gitlab", connected: false });
  });

  it("returns nothing for an empty account", () => {
    expect(platformUsage([], [])).toEqual([]);
  });
});

describe("ringTone and clampPercent", () => {
  it("changes tone at 70 and 90 percent", () => {
    expect(ringTone(70)).toBe("ok");
    expect(ringTone(71)).toBe("warn");
    expect(ringTone(90)).toBe("warn");
    expect(ringTone(91)).toBe("danger");
  });

  it("clamps to 0..100 and tolerates a missing limit", () => {
    expect(clampPercent(50, 200)).toBe(25);
    expect(clampPercent(500, 200)).toBe(100);
    expect(clampPercent(10, 0)).toBe(0);
    expect(clampPercent(-5, 100)).toBe(0);
  });
});
