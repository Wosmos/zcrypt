import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

async function load() {
  vi.resetModules();
  return import("@/store/translate");
}

describe("tr", () => {
  beforeEach(() => {
    document.documentElement.lang = "en";
  });
  afterEach(() => {
    document.documentElement.lang = "en";
    vi.useRealTimers();
  });

  it("translates from the English catalog and interpolates values", async () => {
    const { tr } = await load();
    expect(tr("l10n.untitledSpace")).toBeTruthy();
    expect(tr("l10n.untitledSpace")).not.toBe("l10n.untitledSpace");
  });

  it("falls back to English until the locale catalog loads, then uses it", async () => {
    const { tr } = await load();
    const english = tr("l10n.untitledSpace");
    document.documentElement.lang = "de";
    expect(tr("l10n.untitledSpace")).toBe(english);
    await vi.waitFor(() => expect(tr("l10n.untitledSpace")).not.toBe(english));
  });

  it("loads every locale catalog on demand", async () => {
    const { tr } = await load();
    const english = tr("l10n.untitledSpace");
    for (const lang of ["ar", "ru", "zh", "de", "es", "fr", "ur"]) {
      document.documentElement.lang = lang;
      tr("l10n.untitledSpace");
      await vi.waitFor(() => expect(tr("l10n.untitledSpace")).not.toBe(""));
    }
    document.documentElement.lang = "en";
    expect(tr("l10n.untitledSpace")).toBe(english);
  });

  it("preloads the active locale and follows lang changes on the document", async () => {
    document.documentElement.lang = "fr";
    vi.useFakeTimers();
    const { tr } = await load();
    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    await vi.waitFor(() => expect(tr("l10n.untitledSpace")).not.toBe("l10n.untitledSpace"));
    document.documentElement.lang = "es";
    await vi.waitFor(() => expect(document.documentElement.lang).toBe("es"));
    await new Promise((r) => setTimeout(r, 20));
    expect(tr("l10n.untitledSpace")).toBeTruthy();
  });
});
