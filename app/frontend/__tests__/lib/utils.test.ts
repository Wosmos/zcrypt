import { describe, it, expect } from "vitest";
import {
  cn,
  formatBytes,
  formatDate,
  formatEta,
  getFileTypeInfo,
  getFileIcon,
  getFileCategory,
  isImageFile,
  easeProgress,
} from "@/lib/utils";

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

  it("formats hours and minutes remaining", () => {
    // 1.5% done in ~60s → total ~4000s → ~3940s (>1h) remaining
    const result = formatEta(Date.now() - 60_000, 1.5);
    expect(result).toMatch(/~\d+h \d+m left/);
  });
});

describe("cn", () => {
  it("joins truthy class names and drops falsy ones", () => {
    expect(cn("a", false, "b", null, undefined, "c")).toBe("a b c");
    expect(cn({ active: true, hidden: false })).toBe("active");
  });
});

describe("formatDate", () => {
  it("returns 'Just now' for under a minute", () => {
    expect(formatDate(new Date().toISOString())).toBe("Just now");
  });

  it("formats minutes, hours, and days ago", () => {
    expect(formatDate(new Date(Date.now() - 5 * 60_000).toISOString())).toMatch(/^\d+m ago$/);
    expect(formatDate(new Date(Date.now() - 3 * 3_600_000).toISOString())).toMatch(/^\d+h ago$/);
    expect(formatDate(new Date(Date.now() - 3 * 86_400_000).toISOString())).toMatch(/^\d+d ago$/);
  });

  it("formats an absolute date for a week or more ago", () => {
    const result = formatDate(new Date(Date.now() - 60 * 86_400_000).toISOString());
    expect(result).not.toMatch(/ago|Just now/);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("getFileCategory / isImageFile", () => {
  it("getFileCategory returns the type label", () => {
    expect(getFileCategory("report.pdf")).toBe("Document");
    expect(getFileCategory("song.mp3")).toBe("Audio");
    expect(getFileCategory("mystery.xyz")).toBe("File");
  });

  it("isImageFile detects image extensions case-insensitively", () => {
    expect(isImageFile("photo.PNG")).toBe(true);
    expect(isImageFile("scan.jpeg")).toBe(true);
    expect(isImageFile("report.pdf")).toBe(false);
    expect(isImageFile("noextension")).toBe(false);
  });
});

describe("easeProgress", () => {
  it("clamps out-of-range input to 0 and 100", () => {
    expect(easeProgress(-10)).toBe(0);
    expect(easeProgress(0)).toBe(0);
    expect(easeProgress(100)).toBe(100);
    expect(easeProgress(150)).toBe(100);
  });

  it("eases an intermediate value into the 0-100 range", () => {
    const v = easeProgress(50);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThanOrEqual(100);
  });
});
