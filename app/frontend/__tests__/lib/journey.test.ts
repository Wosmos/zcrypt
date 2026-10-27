import { describe, expect, it } from "vitest";
import { JOURNEY_FAMILIES, groupByDay, localDay, metaText } from "@/lib/journey";
import type { JourneyEvent } from "@/lib/api";

const ev = (id: string, created_at: string, metadata: Record<string, unknown> = {}): JourneyEvent => ({
  id,
  kind: "login",
  family: "auth",
  created_at,
  ip_prefix: "",
  user_agent: "",
  device: "",
  metadata,
});

describe("journey helpers", () => {
  it("lists every family once", () => {
    expect(new Set(JOURNEY_FAMILIES).size).toBe(7);
  });

  it("formats a local day with padding", () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59).toISOString())).toBe("2026-01-05");
  });

  it("groups consecutive events by day in order", () => {
    const a = new Date(2026, 9, 27, 18).toISOString();
    const b = new Date(2026, 9, 27, 9).toISOString();
    const c = new Date(2026, 9, 25, 9).toISOString();
    const groups = groupByDay([ev("1", a), ev("2", b), ev("3", c)]);
    expect(groups.map((g) => [g.day, g.events.map((e) => e.id)])).toEqual([
      ["2026-10-27", ["1", "2"]],
      ["2026-10-25", ["3"]],
    ]);
    expect(groupByDay([])).toEqual([]);
  });

  it("reads string and number metadata only", () => {
    const e = ev("1", new Date().toISOString(), { country: "DE", n: 3, obj: { a: 1 }, nil: null });
    expect(metaText(e, "country")).toBe("DE");
    expect(metaText(e, "n")).toBe("3");
    expect(metaText(e, "obj")).toBe("");
    expect(metaText(e, "nil")).toBe("");
    expect(metaText(e, "missing")).toBe("");
    expect(metaText({ ...e, metadata: undefined as never }, "country")).toBe("");
  });
});
