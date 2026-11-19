import { describe, it, expect } from "vitest";
import { ApiError } from "@/lib/http-error";
import {
  DESKTOP_DOWNLOAD_PATH,
  WebTransferLimitCode,
  WebTransferLimitError,
  formatResetDate,
  webTransferLimitFrom,
  webTransferLimitMessage,
} from "@/lib/web-transfer-limit";

const GIB = 1024 ** 3;

describe("formatResetDate", () => {
  it("formats the reset day in UTC, so it never slips to the day before", () => {
    expect(formatResetDate("2026-12-01T00:00:00Z")).toBe("December 1");
  });
});

describe("webTransferLimitMessage", () => {
  it("points big files at the desktop app", () => {
    const msg = webTransferLimitMessage(WebTransferLimitCode.FileTooLarge, { limitBytes: 2 * GIB });
    expect(msg).toBe(
      "Files over 2 GB can't be uploaded from the browser. Big files belong in the desktop app: it's faster, keeps going in the background and has no size limit.",
    );
  });

  it("names the allowance and the day it resets", () => {
    const msg = webTransferLimitMessage(WebTransferLimitCode.AllowanceExceeded, {
      limitBytes: 20 * GIB,
      resetsAt: "2026-12-01T00:00:00Z",
    });
    expect(msg).toBe(
      "You've used your 20 GB transfer allowance for this month. It resets on December 1. Anything that goes straight to your own storage doesn't count.",
    );
  });

  it("names the daily allowance and the time it resets", () => {
    const msg = webTransferLimitMessage(WebTransferLimitCode.DailyExceeded, {
      limitBytes: 5 * GIB,
      resetsAt: "2026-11-20T00:00:00Z",
    });
    expect(msg).toContain("today's 5 GB transfer allowance");
    expect(msg).toMatch(/resets at 12:00 AM/);
  });

  it("leaves the date out when the server did not send one", () => {
    const msg = webTransferLimitMessage(WebTransferLimitCode.AllowanceExceeded, { limitBytes: 20 * GIB });
    expect(msg).toBe("You've used your 20 GB transfer allowance for this month. Anything that goes straight to your own storage doesn't count.");
  });

  it("never says relay", () => {
    for (const code of Object.values(WebTransferLimitCode)) {
      expect(webTransferLimitMessage(code, { limitBytes: GIB, resetsAt: "2026-12-01T00:00:00Z" })).not.toMatch(
        /relay/i,
      );
    }
  });
});

describe("WebTransferLimitError", () => {
  it("is an ApiError carrying the code, numbers and friendly message", () => {
    const err = new WebTransferLimitError(WebTransferLimitCode.FileTooLarge, { limitBytes: GIB }, 413);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.name).toBe("WebTransferLimitError");
    expect(err.status).toBe(413);
    expect(err.code).toBe(WebTransferLimitCode.FileTooLarge);
    expect(err.info).toEqual({ limitBytes: GIB });
    expect(err.message).toContain("1 GB");
  });
});

describe("webTransferLimitFrom", () => {
  it("reads a file-too-large refusal", () => {
    const err = webTransferLimitFrom(
      JSON.stringify({ code: "relay_file_too_large", limit_bytes: 2 * GIB }),
      413,
    );
    expect(err?.code).toBe(WebTransferLimitCode.FileTooLarge);
    expect(err?.info).toEqual({ limitBytes: 2 * GIB, usedBytes: undefined, resetsAt: undefined });
    expect(err?.status).toBe(413);
  });

  it("reads an allowance refusal with its reset date", () => {
    const err = webTransferLimitFrom(
      JSON.stringify({
        code: "relay_allowance_exceeded",
        used_bytes: 21 * GIB,
        limit_bytes: 20 * GIB,
        resets_at: "2026-12-01T00:00:00Z",
      }),
      403,
    );
    expect(err?.code).toBe(WebTransferLimitCode.AllowanceExceeded);
    expect(err?.info).toEqual({
      limitBytes: 20 * GIB,
      usedBytes: 21 * GIB,
      resetsAt: "2026-12-01T00:00:00Z",
    });
    expect(err?.limit).toEqual({
      code: WebTransferLimitCode.AllowanceExceeded,
      limitBytes: 20 * GIB,
      usedBytes: 21 * GIB,
      resetsAt: "2026-12-01T00:00:00Z",
    });
  });

  it("reads a daily refusal with its reset time", () => {
    const err = webTransferLimitFrom(
      JSON.stringify({
        code: "relay_daily_exceeded",
        used_bytes: 5 * GIB,
        limit_bytes: 5 * GIB,
        resets_at: "2026-11-20T00:00:00Z",
      }),
      403,
    );
    expect(err?.code).toBe(WebTransferLimitCode.DailyExceeded);
    expect(err?.info.resetsAt).toBe("2026-11-20T00:00:00Z");
  });

  it("tolerates missing or malformed numbers", () => {
    const err = webTransferLimitFrom(
      JSON.stringify({
        code: "relay_allowance_exceeded",
        limit_bytes: "lots",
        used_bytes: "some",
        resets_at: 5,
      }),
      403,
    );
    expect(err?.info).toEqual({ limitBytes: 0, usedBytes: undefined, resetsAt: undefined });
  });

  it("ignores every other error", () => {
    expect(webTransferLimitFrom(JSON.stringify({ error: "nope", code: "other" }), 400)).toBeNull();
    expect(webTransferLimitFrom("null", 400)).toBeNull();
    expect(webTransferLimitFrom("not json", 500)).toBeNull();
  });
});

it("sends people to the download page", () => {
  expect(DESKTOP_DOWNLOAD_PATH).toBe("/download");
});

describe("linkAllowanceKey", () => {
  it("names the owner's daily or monthly allowance and ignores other refusals", async () => {
    const { linkAllowanceKey } = await import("@/lib/web-transfer-limit");
    const { ApiError } = await import("@/lib/http-error");
    expect(linkAllowanceKey(new ApiError("x", 403, 0, "", "relay_daily_exceeded"))).toBe(
      "pub.ownerDailyUsed",
    );
    expect(linkAllowanceKey(new ApiError("x", 403, 0, "", "relay_allowance_exceeded"))).toBe(
      "pub.ownerMonthlyUsed",
    );
    expect(linkAllowanceKey(new ApiError("wrong password", 403))).toBeNull();
    expect(linkAllowanceKey(new Error("boom"))).toBeNull();
  });
});
