import { describe, expect, it } from "vitest";
import { createAutoResumeBudget } from "@/lib/auto-resume";
import { AUTO_RESUME_MAX_ATTEMPTS } from "@/lib/transport";

describe("auto-resume budget", () => {
  it("allows a first attempt for an item it has never seen", () => {
    expect(createAutoResumeBudget().due("a", 0)).toBe(true);
  });

  it("makes the next attempt wait out a backoff", () => {
    const b = createAutoResumeBudget();
    b.spend("a", 0);
    expect(b.due("a", 1_000)).toBe(false);
    expect(b.due("a", 60_000)).toBe(true);
  });

  it("stops offering an item after the attempt budget, whatever the time", () => {
    const b = createAutoResumeBudget();
    for (let i = 0; i < AUTO_RESUME_MAX_ATTEMPTS; i++) b.spend("a", i * 1_000_000);
    expect(b.attempts("a")).toBe(AUTO_RESUME_MAX_ATTEMPTS);
    expect(b.due("a", 1e12)).toBe(false);
  });

  it("keeps budgets per item and restores one on reset", () => {
    const b = createAutoResumeBudget();
    for (let i = 0; i < AUTO_RESUME_MAX_ATTEMPTS; i++) b.spend("a", 0);
    expect(b.due("b", 0)).toBe(true);
    b.reset("a");
    expect(b.due("a", 0)).toBe(true);
    expect(b.attempts("a")).toBe(0);
  });
});
