import { describe, it, expect } from "vitest";
import { quotaModeFor, parseQuotaInput, formatQuotaDisplay } from "@/lib/quota";
import { formatBytes, gbToBytes } from "@/lib/utils";

describe("quotaModeFor", () => {
  it("maps null to the plan default", () => {
    expect(quotaModeFor(null)).toBe("default");
  });
  it("maps 0 to unlimited", () => {
    expect(quotaModeFor(0)).toBe("unlimited");
  });
  it("maps a positive byte count to custom", () => {
    expect(quotaModeFor(1024)).toBe("custom");
  });
});

describe("parseQuotaInput", () => {
  it("unlimited mode persists 0 regardless of input", () => {
    expect(parseQuotaInput("unlimited", "ignored")).toEqual({ ok: true, bytes: 0 });
  });

  it("default mode persists null regardless of input", () => {
    expect(parseQuotaInput("default", "ignored")).toEqual({ ok: true, bytes: null });
  });

  it("custom mode converts a valid GB value to rounded bytes", () => {
    expect(parseQuotaInput("custom", "2")).toEqual({
      ok: true,
      bytes: Math.round(gbToBytes(2)),
    });
  });

  it("custom mode accepts fractional GB", () => {
    expect(parseQuotaInput("custom", "1.5")).toEqual({
      ok: true,
      bytes: Math.round(gbToBytes(1.5)),
    });
  });

  it("custom mode rejects non-numeric input", () => {
    expect(parseQuotaInput("custom", "abc")).toEqual({
      ok: false,
      error: "Enter a valid quota in GB",
    });
  });

  it("custom mode rejects zero and negative values", () => {
    expect(parseQuotaInput("custom", "0")).toEqual({
      ok: false,
      error: "Enter a valid quota in GB",
    });
    expect(parseQuotaInput("custom", "-5")).toEqual({
      ok: false,
      error: "Enter a valid quota in GB",
    });
  });
});

describe("formatQuotaDisplay", () => {
  it("prefers the plan display string for a null quota", () => {
    expect(formatQuotaDisplay(null, { planDisplay: "Free (1 GB)" })).toBe("Free (1 GB)");
  });

  it("formats the default bytes for a null quota when no plan string given", () => {
    const def = gbToBytes(5);
    expect(formatQuotaDisplay(null, { defaultBytes: def })).toBe(formatBytes(def));
  });

  it("shows Unlimited for a null quota with no plan string and no positive default", () => {
    expect(formatQuotaDisplay(null)).toBe("Unlimited");
    expect(formatQuotaDisplay(null, { defaultBytes: 0 })).toBe("Unlimited");
  });

  it("shows Unlimited for a stored 0", () => {
    expect(formatQuotaDisplay(0)).toBe("Unlimited");
  });

  it("formats a positive stored quota", () => {
    const bytes = gbToBytes(3);
    expect(formatQuotaDisplay(bytes)).toBe(formatBytes(bytes));
  });
});
