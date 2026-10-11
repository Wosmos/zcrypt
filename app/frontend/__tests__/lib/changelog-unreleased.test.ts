import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/changelog.json", () => ({
  default: [
    { version: "9.9.9", date: null, key: "v9_9_9", groups: [] },
    { version: "9.9.8", date: null, key: "v9_9_8", groups: [] },
  ],
}));

import { LATEST_RELEASED, LATEST_RELEASED_VERSION } from "@/lib/changelog";

describe("changelog with nothing released yet", () => {
  it("falls back to the newest entry", () => {
    expect(LATEST_RELEASED.version).toBe("9.9.9");
    expect(LATEST_RELEASED_VERSION).toBe("9.9.9");
  });
});
