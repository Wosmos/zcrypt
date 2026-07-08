import { describe, it, expect } from "vitest";
import { parseErrorBody, throwResponseError } from "@/lib/http-error";

describe("parseErrorBody", () => {
  it("pulls the `error` field out of a JSON body", () => {
    expect(parseErrorBody('{"error":"repo not found"}')).toBe("repo not found");
  });

  it("falls back to the raw body when JSON has no non-empty `error`", () => {
    expect(parseErrorBody('{"error":""}')).toBe('{"error":""}');
    expect(parseErrorBody('{"message":"nope"}')).toBe('{"message":"nope"}');
  });

  it("returns a plain-text body verbatim", () => {
    expect(parseErrorBody("502 Bad Gateway")).toBe("502 Bad Gateway");
  });

  it("returns the raw body when JSON.parse yields a value with no `.error`", () => {
    // JSON.parse("null") -> null; null.error throws -> caught -> raw body.
    expect(parseErrorBody("null")).toBe("null");
    // A bare number parses fine but has no `.error`, so `.error` is undefined
    // -> `|| body`.
    expect(parseErrorBody("123")).toBe("123");
  });
});

describe("throwResponseError", () => {
  it("throws an Error carrying the parsed server message", async () => {
    const res = { text: async () => '{"error":"quota exceeded"}' } as unknown as Response;
    await expect(throwResponseError(res)).rejects.toThrow("quota exceeded");
  });

  it("throws with the raw body for a non-JSON response", async () => {
    const res = { text: async () => "upstream timeout" } as unknown as Response;
    await expect(throwResponseError(res)).rejects.toThrow("upstream timeout");
  });
});
