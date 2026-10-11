import { describe, expect, it } from "vitest";
import en from "@/messages/site/changelog/en.json";
import {
  CHANGE_KINDS,
  LATEST_RELEASED,
  LATEST_RELEASED_VERSION,
  RELEASES,
  adjacentReleases,
  findRelease,
} from "@/lib/changelog";

const cmp = (a: string, b: string) => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  return pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
};
const catalog = en.changelog as unknown as Record<
  string,
  { title: string; summary: string; items: Record<string, string> }
>;

describe("changelog data", () => {
  it("is sorted newest first", () => {
    const versions = RELEASES.map((r) => r.version);
    expect([...versions].sort((a, b) => cmp(b, a))).toEqual(versions);
  });

  it("derives each key from its version", () => {
    for (const r of RELEASES) expect(r.key).toBe(`v${r.version.replaceAll(".", "_")}`);
  });

  it("has at most one upcoming release and it is the newest", () => {
    const upcoming = RELEASES.filter((r) => r.date === null);
    expect(upcoming.length).toBeLessThanOrEqual(1);
    if (upcoming.length) expect(RELEASES[0].date).toBeNull();
  });

  it("dates never go backwards for released versions", () => {
    const dates = RELEASES.filter((r) => r.date).map((r) => r.date as string);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("has english text for every release and every item", () => {
    for (const r of RELEASES) {
      const entry = catalog[r.key];
      expect(entry, r.key).toBeDefined();
      expect(entry.title.trim()).not.toBe("");
      expect(entry.summary.trim()).not.toBe("");
      for (const g of r.groups) {
        expect(CHANGE_KINDS).toContain(g.kind);
        expect(g.items.length).toBeGreaterThan(0);
        for (const item of g.items) expect(entry.items[item], `${r.key}.${item}`).toBeTruthy();
      }
      const used = new Set(r.groups.flatMap((g) => g.items));
      expect(Object.keys(entry.items).sort()).toEqual([...used].sort());
    }
  });

  it("lists each kind at most once per release", () => {
    for (const r of RELEASES) {
      const kinds = r.groups.map((g) => g.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });

  it("exposes the latest released version", () => {
    expect(LATEST_RELEASED.date).not.toBeNull();
    expect(LATEST_RELEASED_VERSION).toBe(LATEST_RELEASED.version);
  });

  it("finds releases and their neighbours", () => {
    expect(findRelease("0.1.7")?.key).toBe("v0_1_7");
    expect(findRelease("9.9.9")).toBeUndefined();
    expect(adjacentReleases("0.1.7").older?.version).toBe("0.1.6");
    expect(adjacentReleases("0.1.7").newer?.version).toBe(RELEASES[RELEASES.indexOf(findRelease("0.1.7")!) - 1].version);
    expect(adjacentReleases(RELEASES[0].version).newer).toBeUndefined();
    expect(adjacentReleases("0.0.0")).toEqual({});
  });
});
