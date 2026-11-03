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
      "You've used your 20 GB of web transfers this month. Resets on December 1. The desktop app has no limit.",
    );
  });

  it("leaves the date out when the server did not send one", () => {
    const msg = webTransferLimitMessage(WebTransferLimitCode.AllowanceExceeded, { limitBytes: 20 * GIB });
    expect(msg).toBe("You've used your 20 GB of web transfers this month. The desktop app has no limit.");
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
    expect(err?.info).toEqual({ limitBytes: 2 * GIB, resetsAt: undefined });
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
    expect(err?.info).toEqual({ limitBytes: 20 * GIB, resetsAt: "2026-12-01T00:00:00Z" });
  });

  it("tolerates missing or malformed numbers", () => {
    const err = webTransferLimitFrom(
      JSON.stringify({ code: "relay_allowance_exceeded", limit_bytes: "lots", resets_at: 5 }),
      403,
    );
    expect(err?.info).toEqual({ limitBytes: 0, resetsAt: undefined });
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
