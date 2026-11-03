import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { fetchPublicReviews } from "@/lib/public-reviews";

const config = vi.hoisted(() => ({ API_BASE: "https://api.test" }));
vi.mock("@/lib/config", () => config);

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  config.API_BASE = "https://api.test";
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchPublicReviews", () => {
  it("returns the reviews and asks Next to revalidate every 5 minutes", async () => {
    const reviews = [{ display_name: "A", rating: 5, quote: "q" }];
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ reviews }) });
    expect(await fetchPublicReviews()).toEqual(reviews);
    expect(fetchMock).toHaveBeenCalledWith("https://api.test/api/reviews/public", {
      next: { revalidate: 300 },
    });
  });

  it("returns nothing without an API base", async () => {
    config.API_BASE = "";
    expect(await fetchPublicReviews()).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns nothing on an error status, a bad payload or a network failure", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    expect(await fetchPublicReviews()).toEqual([]);
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ reviews: "x" }) });
    expect(await fetchPublicReviews()).toEqual([]);
    fetchMock.mockRejectedValueOnce(new Error("down"));
    expect(await fetchPublicReviews()).toEqual([]);
  });
});
