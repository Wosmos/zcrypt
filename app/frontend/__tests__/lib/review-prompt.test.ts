import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  markReviewPrompted,
  recordSuccessfulUpload,
  shouldPromptForReview,
} from "@/lib/review-prompt";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-30T12:00:00Z");

let store: Map<string, string>;
let storage: { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void };

beforeEach(() => {
  store = new Map();
  storage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, v),
  };
  vi.stubGlobal("localStorage", storage);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("shouldPromptForReview", () => {
  it("stays quiet for a new account with few uploads", () => {
    const created = new Date(NOW - 2 * DAY).toISOString();
    for (let i = 0; i < 9; i++) recordSuccessfulUpload("u1");
    expect(shouldPromptForReview("u1", created, NOW)).toBe(false);
  });

  it("fires on the 10th upload", () => {
    const created = new Date(NOW - DAY).toISOString();
    for (let i = 0; i < 10; i++) recordSuccessfulUpload("u1");
    expect(shouldPromptForReview("u1", created, NOW)).toBe(true);
  });

  it("fires 7 days after signup", () => {
    expect(shouldPromptForReview("u1", new Date(NOW - 7 * DAY).toISOString(), NOW)).toBe(true);
    expect(shouldPromptForReview("u1", new Date(NOW - 7 * DAY + 1000).toISOString(), NOW)).toBe(
      false,
    );
  });

  it("ignores a missing or unparsable signup date", () => {
    expect(shouldPromptForReview("u1", undefined, NOW)).toBe(false);
    expect(shouldPromptForReview("u1", "", NOW)).toBe(false);
    expect(shouldPromptForReview("u1", "nope", NOW)).toBe(false);
  });

  it("defaults now to the current time", () => {
    expect(shouldPromptForReview("u1", "2020-01-01T00:00:00Z")).toBe(true);
  });

  it("never fires again once prompted, and is per user", () => {
    const old = new Date(NOW - 30 * DAY).toISOString();
    markReviewPrompted("u1");
    expect(shouldPromptForReview("u1", old, NOW)).toBe(false);
    expect(shouldPromptForReview("u2", old, NOW)).toBe(true);
  });

  it("keeps the upload count when marking prompted", () => {
    recordSuccessfulUpload("u1");
    markReviewPrompted("u1");
    expect(JSON.parse(store.get("zcrypt-review:u1")!)).toEqual({
      uploads: 1,
      prompted: true,
    });
  });

  it("recovers from corrupt or malformed storage", () => {
    store.set("zcrypt-review:u1", "{not json");
    expect(shouldPromptForReview("u1", undefined, NOW)).toBe(false);
    store.set("zcrypt-review:u1", JSON.stringify({ uploads: "x", prompted: "y" }));
    recordSuccessfulUpload("u1");
    expect(JSON.parse(store.get("zcrypt-review:u1")!).uploads).toBe(1);
  });

  it("does not throw when storage is unavailable", () => {
    const blocked = () => {
      throw new Error("blocked");
    };
    storage.getItem = blocked;
    storage.setItem = blocked;
    expect(() => recordSuccessfulUpload("u1")).not.toThrow();
    expect(() => markReviewPrompted("u1")).not.toThrow();
    expect(shouldPromptForReview("u1", undefined, NOW)).toBe(false);
  });
});
