import { beforeEach, describe, expect, it, vi } from "vitest";

const { authedFetch } = vi.hoisted(() => ({ authedFetch: vi.fn() }));
vi.mock("@/lib/auth-fetch", () => ({
  authedFetch,
  shouldRefreshOn401: vi.fn(),
  tryRefreshToken: vi.fn(),
}));

import { downloadLinkedChunk, getChunkLink } from "@/lib/api";

const LINK = { url: "https://us.aws.cdn.hf.co/x", expires_at: "", size: 4, sha256: "s", compressed: true };

beforeEach(() => vi.clearAllMocks());

describe("getChunkLink", () => {
  it("asks the server for the chunk's link and returns it", async () => {
    authedFetch.mockResolvedValue(new Response(JSON.stringify(LINK), { status: 200 }));
    await expect(getChunkLink("f1", 3)).resolves.toEqual(LINK);
    expect(authedFetch.mock.calls[0][0]).toMatch(/\/api\/files\/f1\/chunks\/3\/link$/);
  });

  it("reads 409 as no link, so the caller uses the server", async () => {
    authedFetch.mockResolvedValue(new Response('{"code":"no_direct_link"}', { status: 409 }));
    await expect(getChunkLink("f1", 0)).resolves.toBeNull();
  });

  it("throws on any other failure", async () => {
    authedFetch.mockResolvedValue(new Response('{"error":"file not found"}', { status: 404 }));
    await expect(getChunkLink("f1", 0)).rejects.toMatchObject({ status: 404 });
  });
});

describe("downloadLinkedChunk", () => {
  it("fetches the platform URL without cookies or referrer", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));
    vi.stubGlobal("fetch", fetchMock);
    const body = await downloadLinkedChunk(LINK.url);
    expect(new Uint8Array(body)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
    vi.unstubAllGlobals();
  });

  it("throws when the platform refuses the link", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));
    await expect(downloadLinkedChunk(LINK.url)).rejects.toMatchObject({ status: 403 });
    vi.unstubAllGlobals();
  });
});
