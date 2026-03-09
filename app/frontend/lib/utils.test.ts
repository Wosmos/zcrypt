import { describe, it, expect } from "vitest";
import { formatBytes, formatEta, getFileTypeInfo, getFileIcon } from "./utils";

describe("formatBytes", () => {
  it("returns 0 B for zero or negative", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
  });

  it("formats bytes", () => {
    expect(formatBytes(500)).toBe("500 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1 GB");
  });
});

describe("getFileTypeInfo", () => {
  it("returns correct info for known extensions", () => {
    const pdf = getFileTypeInfo("report.pdf");
    expect(pdf.icon).toBe("FileText");
    expect(pdf.color).toContain("rose");

    const mp4 = getFileTypeInfo("video.mp4");
    expect(mp4.icon).toBe("Video");

    const zip = getFileTypeInfo("archive.zip");
    expect(zip.icon).toBe("Archive");

    const ts = getFileTypeInfo("index.ts");
    expect(ts.icon).toBe("Code");
  });

  it("returns default for unknown extension", () => {
    const unknown = getFileTypeInfo("file.xyz");
    expect(unknown.icon).toBe("File");
  });

  it("handles files without extension", () => {
    const noExt = getFileTypeInfo("Makefile");
    expect(noExt.icon).toBe("File");
  });
});

describe("getFileIcon", () => {
  it("returns icon string for known type", () => {
    expect(getFileIcon("photo.png")).toBe("Image");
  });
});

describe("formatEta", () => {
  it("returns undefined for very low percent", () => {
    expect(formatEta(Date.now() - 10000, 0.5)).toBeUndefined();
  });

  it("returns undefined for 100%", () => {
    expect(formatEta(Date.now() - 10000, 100)).toBeUndefined();
  });

  it("returns undefined if not enough elapsed time", () => {
    expect(formatEta(Date.now() - 1000, 50)).toBeUndefined();
  });

  it("formats seconds remaining", () => {
    // 50% done in 10 seconds → ~10s left
    const startedAt = Date.now() - 10000;
    const result = formatEta(startedAt, 50);
    expect(result).toMatch(/~\d+s left/);
  });

  it("formats minutes remaining", () => {
    // 10% done in 60 seconds → ~540s ≈ 9m left
    const startedAt = Date.now() - 60000;
    const result = formatEta(startedAt, 10);
    expect(result).toMatch(/~\d+m left/);
  });
});
