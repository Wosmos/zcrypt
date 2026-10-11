// @vitest-environment node
import { describe, it, expect } from "vitest";
import { tr } from "@/store/translate";

describe("tr without a document", () => {
  it("uses the English catalog", () => {
    expect(tr("l10n.untitledSpace")).not.toBe("l10n.untitledSpace");
  });
});
