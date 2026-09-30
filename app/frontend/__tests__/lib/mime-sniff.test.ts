import { describe, it, expect } from "vitest";
import { sniffFileType, hasExtension, resolveDownloadName } from "@/lib/mime-sniff";

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p))
  );

describe("sniffFileType", () => {
  it.each([
    ["png", bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])],
    ["jpg", bytes([0xff, 0xd8, 0xff, 0xe0])],
    ["gif", bytes("GIF87a")],
    ["gif", bytes("GIF89a", [0])],
    ["webp", bytes("RIFF", [1, 2, 3, 4], "WEBPVP8 ")],
    ["pdf", bytes("%PDF-1.7")],
    ["mp4", bytes([0, 0, 0, 0x20], "ftypisom")],
    ["zip", bytes([0x50, 0x4b, 0x03, 0x04])],
    ["zip", bytes([0x50, 0x4b, 0x05, 0x06])],
    ["zip", bytes([0x50, 0x4b, 0x07, 0x08])],
  ])("detects %s", (ext, data) => {
    expect(sniffFileType(data)?.ext).toBe(ext);
  });

  it("returns the matching MIME type", () => {
    expect(sniffFileType(bytes("%PDF-"))).toEqual({ ext: "pdf", mime: "application/pdf" });
  });

  it("returns null for unknown or too-short data", () => {
    expect(sniffFileType(bytes("hello world"))).toBeNull();
    expect(sniffFileType(new Uint8Array())).toBeNull();
    expect(sniffFileType(bytes("RIFF", [1, 2, 3, 4], "WAVE"))).toBeNull();
    expect(sniffFileType(bytes([0x50, 0x4b, 0x01, 0x02]))).toBeNull();
  });
});

describe("hasExtension", () => {
  it("accepts a normal extension and rejects bare stems and dotfiles", () => {
    expect(hasExtension("report.pdf")).toBe(true);
    expect(hasExtension("archive.tar.gz")).toBe(true);
    expect(hasExtension("report")).toBe(false);
    expect(hasExtension(".env")).toBe(false);
    expect(hasExtension("notes.")).toBe(false);
    expect(hasExtension("weird.extension-way-too-long")).toBe(false);
  });
});

describe("resolveDownloadName", () => {
  const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  it("keeps a real name with an extension", () => {
    expect(resolveDownloadName(" photo.jpeg ", png)).toBe("photo.jpeg");
  });

  it("appends a sniffed extension to an extensionless name", () => {
    expect(resolveDownloadName("photo", png)).toBe("photo.png");
  });

  it("uses the fallback stem when there is no name", () => {
    expect(resolveDownloadName("", png)).toBe("download.png");
    expect(resolveDownloadName("", png, "file")).toBe("file.png");
  });

  it("leaves the stem alone when the type is unknown", () => {
    expect(resolveDownloadName("", bytes("plain text"))).toBe("download");
    expect(resolveDownloadName("README", bytes("plain text"))).toBe("README");
  });
});
