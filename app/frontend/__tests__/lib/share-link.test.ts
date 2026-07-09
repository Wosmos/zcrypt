import { describe, it, expect, afterEach, vi } from "vitest";
import { keyFromFragment, pathManifestFromFragment } from "@/lib/share-link";
import { gzipSync, strToU8 } from "fflate";
import { toBase64 } from "@/lib/crypto";

function setHash(hash: string) {
  window.location.hash = hash;
}

describe("keyFromFragment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setHash("");
  });

  it("extracts the base64 key from the #key= fragment", () => {
    setHash("#key=aGVsbG8rL3dvcmxkPQ==");
    expect(keyFromFragment()).toBe("aGVsbG8rL3dvcmxkPQ==");
  });

  it("finds the key even when other fragment params precede it", () => {
    setHash("#foo=bar&key=ABC123");
    expect(keyFromFragment()).toBe("ABC123");
  });

  it("returns null when there is no key in the fragment", () => {
    setHash("#nothing=here");
    expect(keyFromFragment()).toBeNull();
  });

  it("returns null server-side (no window)", () => {
    vi.stubGlobal("window", undefined);
    expect(keyFromFragment()).toBeNull();
  });
});

describe("pathManifestFromFragment", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setHash("");
  });

  it("returns {} server-side (no window)", async () => {
    vi.stubGlobal("window", undefined);
    await expect(pathManifestFromFragment()).resolves.toEqual({});
  });

  it("returns {} when no paths param is present", async () => {
    setHash("#key=abc");
    await expect(pathManifestFromFragment()).resolves.toEqual({});
  });

  it("decodes a gzip+base64 manifest into a file_id -> directory map", async () => {
    const manifest = { fileA: "docs", fileB: "docs/sub" };
    const b64 = toBase64(gzipSync(strToU8(JSON.stringify(manifest))));
    setHash(`#key=abc&paths=${b64}`);
    await expect(pathManifestFromFragment()).resolves.toEqual(manifest);
  });

  it("returns {} when the decoded payload is not an object", async () => {
    const b64 = toBase64(gzipSync(strToU8(JSON.stringify(42))));
    setHash(`#paths=${b64}`);
    await expect(pathManifestFromFragment()).resolves.toEqual({});
  });

  it("returns {} when the paths payload is unreadable", async () => {
    // Valid base64 alphabet (so the regex matches) but not valid gzip data.
    setHash("#paths=AAAABBBBCCCC");
    await expect(pathManifestFromFragment()).resolves.toEqual({});
  });
});
