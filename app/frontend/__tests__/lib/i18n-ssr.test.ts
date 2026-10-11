// @vitest-environment node
import { describe, it, expect } from "vitest";
import { documentLocale, intlLocale } from "@/lib/i18n";

describe("document locale without a document", () => {
  it("uses the default locale", () => {
    expect(documentLocale()).toBe("en");
    expect(intlLocale()).toBe("en-US");
  });
});
