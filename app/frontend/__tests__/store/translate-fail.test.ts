import { describe, it, expect, vi } from "vitest";

const broken = vi.hoisted(() => ({ on: false }));
vi.mock("@/lib/i18n", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/i18n")>();
  return {
    ...actual,
    mergeMessages: (...args: Parameters<typeof actual.mergeMessages>) => {
      if (broken.on) throw new Error("corrupt catalog");
      return actual.mergeMessages(...args);
    },
  };
});

import { tr } from "@/store/translate";

describe("tr when a catalog cannot be used", () => {
  it("keeps serving English", async () => {
    const english = tr("l10n.untitledSpace");
    broken.on = true;
    document.documentElement.lang = "ur";
    tr("l10n.untitledSpace");
    await new Promise((r) => setTimeout(r, 50));
    expect(tr("l10n.untitledSpace")).toBe(english);
    document.documentElement.lang = "en";
  });
});
