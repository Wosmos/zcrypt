import { describe, it, expect, afterEach } from "vitest";
import { documentLocale, intlLocale } from "@/lib/i18n";

afterEach(() => {
  document.documentElement.lang = "en";
});

describe("document locale", () => {
  it("reads the base language from <html lang>", () => {
    document.documentElement.lang = "de-AT";
    expect(documentLocale()).toBe("de");
    expect(intlLocale()).toBe("de");
  });

  it("falls back to English for an unsupported or empty language", () => {
    document.documentElement.lang = "xx";
    expect(documentLocale()).toBe("en");
    document.documentElement.lang = "";
    expect(documentLocale()).toBe("en");
  });

  it("maps English to the en-US Intl locale", () => {
    document.documentElement.lang = "en";
    expect(intlLocale()).toBe("en-US");
  });
});
