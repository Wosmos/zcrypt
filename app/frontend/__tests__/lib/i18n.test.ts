import { afterEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const backing = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
      setItem: (k: string, v: string) => {
        backing.set(k, String(v));
      },
      removeItem: (k: string) => {
        backing.delete(k);
      },
      clear: () => backing.clear(),
    },
  });
});

import {
  LOCALES,
  LOCALE_INIT_SCRIPT,
  LOCALE_STORAGE_KEY,
  applyDocumentLocale,
  detectLocale,
  isLocale,
  localeDir,
  matchLocale,
  mergeMessages,
  persistLocale,
  readStoredLocale,
} from "@/lib/i18n";

afterEach(() => {
  localStorage.clear();
  document.cookie = `${LOCALE_STORAGE_KEY}=; path=/; max-age=0`;
  document.documentElement.removeAttribute("lang");
  document.documentElement.removeAttribute("dir");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("locale table", () => {
  it("ships the eight supported languages with ar and ur right to left", () => {
    expect(LOCALES.map((l) => l.code)).toEqual(["en", "ar", "ru", "zh", "de", "es", "fr", "ur"]);
    expect(LOCALES.filter((l) => l.dir === "rtl").map((l) => l.code)).toEqual(["ar", "ur"]);
  });

  it("validates locale codes", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("xx")).toBe(false);
    expect(isLocale(null)).toBe(false);
  });

  it("resolves direction and falls back to ltr for unknown codes", () => {
    expect(localeDir("ar")).toBe("rtl");
    expect(localeDir("de")).toBe("ltr");
    expect(localeDir("zz" as never)).toBe("ltr");
  });
});

describe("matchLocale", () => {
  it("picks the first supported base language", () => {
    expect(matchLocale(["pt-BR", "ES-mx", "fr"])).toBe("es");
  });

  it("falls back to english", () => {
    expect(matchLocale(["pt-BR"])).toBe("en");
    expect(matchLocale([])).toBe("en");
  });
});

describe("storage and detection", () => {
  it("reads a stored locale and ignores garbage", () => {
    expect(readStoredLocale()).toBeNull();
    localStorage.setItem(LOCALE_STORAGE_KEY, "nope");
    expect(readStoredLocale()).toBeNull();
    localStorage.setItem(LOCALE_STORAGE_KEY, "ur");
    expect(readStoredLocale()).toBe("ur");
  });

  it("returns null when storage throws", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readStoredLocale()).toBeNull();
  });

  it("prefers the stored locale over the browser", () => {
    vi.stubGlobal("navigator", { languages: ["de"] });
    localStorage.setItem(LOCALE_STORAGE_KEY, "ru");
    expect(detectLocale()).toBe("ru");
  });

  it("detects from the browser languages on first visit", () => {
    vi.stubGlobal("navigator", { languages: ["zh-CN", "en"] });
    expect(detectLocale()).toBe("zh");
  });

  it("defaults to english when the browser exposes no languages", () => {
    vi.stubGlobal("navigator", {});
    expect(detectLocale()).toBe("en");
  });

  it("persists to localStorage and a cookie", () => {
    persistLocale("fr");
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("fr");
    expect(document.cookie).toContain(`${LOCALE_STORAGE_KEY}=fr`);
  });

  it("still sets the cookie when storage throws", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    persistLocale("de");
    expect(document.cookie).toContain(`${LOCALE_STORAGE_KEY}=de`);
  });
});

describe("applyDocumentLocale", () => {
  it("sets lang and dir on the root element", () => {
    applyDocumentLocale("ar");
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
    applyDocumentLocale("en");
    expect(document.documentElement.dir).toBe("ltr");
  });
});

describe("mergeMessages", () => {
  it("overlays nested keys and keeps base fallbacks", () => {
    const merged = mergeMessages(
      { a: { x: "1", y: "2" }, b: "3" },
      { a: { y: "two" }, c: "new" },
    );
    expect(merged).toEqual({ a: { x: "1", y: "two" }, b: "3", c: "new" });
  });

  it("replaces a primitive with an object and null values", () => {
    expect(mergeMessages({ a: "s" }, { a: { k: "v" } })).toEqual({ a: { k: "v" } });
    expect(mergeMessages({ a: { k: "v" } }, { a: null })).toEqual({ a: null });
  });
});

describe("LOCALE_INIT_SCRIPT", () => {
  const run = () => new Function(LOCALE_INIT_SCRIPT)();

  it("applies a stored rtl locale before hydration", () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, "ur");
    run();
    expect(document.documentElement.lang).toBe("ur");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("detects from the browser and sets ltr for non-rtl languages", () => {
    vi.stubGlobal("navigator", { languages: ["pt", "de-AT"] });
    run();
    expect(document.documentElement.lang).toBe("de");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("leaves english pages untouched", () => {
    vi.stubGlobal("navigator", { languages: ["en-US"] });
    run();
    expect(document.documentElement.getAttribute("lang")).toBeNull();
  });

  it("never throws when storage is blocked", () => {
    vi.spyOn(localStorage, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(run).not.toThrow();
  });
});
