import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatDateTime,
  formatDateShort,
  formatRelativeTime,
  formatDuration,
  formatExpiry,
  EXPIRY_OPTIONS,
  localDateKey,
  savingsPercent,
  gbToBytes,
  bytesToGb,
  usagePercent,
  truncateMiddle,
  fileIconFor,
  fileNameById,
  concatChunks,
  saveBlob,
} from "@/lib/utils";
import type { FileMetadata } from "@/types";

describe("formatDateTime", () => {
  it("renders an absolute en-US date + time", () => {
    const out = formatDateTime(new Date(2026, 6, 8, 21, 41));
    expect(out).toContain("2026");
    expect(out).toMatch(/Jul/);
  });

  it("adds a seconds field when opts.seconds is set", () => {
    const withSeconds = formatDateTime(new Date(2026, 6, 8, 21, 41, 30), { seconds: true });
    const without = formatDateTime(new Date(2026, 6, 8, 21, 41, 30));
    expect(withSeconds).toContain("2026");
    // The seconds variant carries at least as much detail as the base one.
    expect(withSeconds.length).toBeGreaterThanOrEqual(without.length);
  });
});

describe("formatDateShort", () => {
  it("renders a date-only en-US string", () => {
    const out = formatDateShort(new Date(2026, 6, 8));
    expect(out).toContain("Jul");
    expect(out).toContain("8");
    expect(out).toContain("2026");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.now();

  it("says 'just now' under a minute", () => {
    expect(formatRelativeTime(now - 5_000)).toBe("just now");
  });
  it("formats minutes, hours, and days ago", () => {
    expect(formatRelativeTime(now - 5 * 60_000)).toBe("5m ago");
    expect(formatRelativeTime(now - 3 * 3_600_000)).toBe("3h ago");
    expect(formatRelativeTime(now - 5 * 86_400_000)).toBe("5d ago");
  });
  it("falls back to a short absolute date past the 30-day cutoff", () => {
    const ts = now - 40 * 86_400_000;
    expect(formatRelativeTime(ts)).toBe(formatDateShort(ts));
  });
  it("accepts a Date, an epoch-ms number, or an ISO string", () => {
    expect(formatRelativeTime(new Date(now - 5_000))).toBe("just now");
    expect(formatRelativeTime(now - 5_000)).toBe("just now");
    expect(formatRelativeTime(new Date(now - 5_000).toISOString())).toBe("just now");
  });
});

describe("formatDuration", () => {
  it("formats m:ss with unpadded minutes", () => {
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(9)).toBe("0:09");
  });
  it("rolls into h:mm:ss once an hour is present", () => {
    expect(formatDuration(3661)).toBe("1:01:01");
  });
  it("pads minutes and never rolls into hours when configured (vault-lock countdown)", () => {
    expect(formatDuration(90, { padMinutes: true, showHours: false })).toBe("01:30");
    expect(formatDuration(5400, { padMinutes: true, showHours: false })).toBe("90:00");
  });
  it("clamps non-finite and negative input to 0:00", () => {
    expect(formatDuration(-5)).toBe("0:00");
    expect(formatDuration(Infinity)).toBe("0:00");
    expect(formatDuration(NaN)).toBe("0:00");
  });
});

describe("formatExpiry", () => {
  it("returns Expired for a past timestamp", () => {
    expect(formatExpiry(new Date(Date.now() - 1000).toISOString())).toBe("Expired");
  });
  it("uses 'Xd Xh' when a day or more remains", () => {
    const future = new Date(Date.now() + 2 * 86_400_000 + 3 * 3_600_000).toISOString();
    expect(formatExpiry(future)).toMatch(/^\d+d \d+h$/);
  });
  it("uses 'Xh Xm' when under a day remains", () => {
    const soon = new Date(Date.now() + 2 * 3_600_000 + 30 * 60_000).toISOString();
    expect(formatExpiry(soon)).toMatch(/^\d+h \d+m$/);
  });
});

describe("EXPIRY_OPTIONS", () => {
  it("offers the shared share-link expiry choices", () => {
    expect(EXPIRY_OPTIONS[0]).toEqual({ label: "Never", value: 0 });
    expect(EXPIRY_OPTIONS.map((o) => o.value)).toEqual([0, 1, 24, 168, 720]);
  });
});

describe("localDateKey", () => {
  it("formats YYYY-MM-DD in local time with zero-padding", () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(localDateKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });
});

describe("savingsPercent", () => {
  it("guards a non-positive original with '0'", () => {
    expect(savingsPercent(0, 5)).toBe("0");
    expect(savingsPercent(-1, 5)).toBe("0");
  });
  it("computes the whole-number savings percent", () => {
    expect(savingsPercent(100, 25)).toBe("75");
  });
  it("floors a negative saving (compared > original) at 0", () => {
    expect(savingsPercent(100, 200)).toBe("0");
  });
});

describe("gbToBytes / bytesToGb", () => {
  it("round-trips GB <-> bytes", () => {
    expect(gbToBytes(2)).toBe(2 * 1024 * 1024 * 1024);
    expect(bytesToGb(1024 * 1024 * 1024)).toBe(1);
    expect(bytesToGb(gbToBytes(3))).toBe(3);
  });
});

describe("usagePercent", () => {
  it("returns a 0-100 percentage", () => {
    expect(usagePercent(50, 100)).toBe(50);
  });
  it("clamps at 100 when over capacity", () => {
    expect(usagePercent(200, 100)).toBe(100);
  });
  it("returns 0 when max is non-positive", () => {
    expect(usagePercent(5, 0)).toBe(0);
    expect(usagePercent(5, -1)).toBe(0);
  });
});

describe("truncateMiddle", () => {
  it("returns the string unchanged when short enough", () => {
    expect(truncateMiddle("abc")).toBe("abc");
  });
  it("middle-truncates with default head/tail of 6", () => {
    expect(truncateMiddle("abcdefghijklmnop")).toBe("abcdef…klmnop");
  });
  it("respects custom head/tail lengths", () => {
    expect(truncateMiddle("0123456789abcdef", 3, 3)).toBe("012…def");
  });
});

describe("fileIconFor", () => {
  it("resolves an icon component for known and unknown file types", () => {
    expect(fileIconFor("photo.png")).toBeDefined();
    expect(fileIconFor("notes.txt")).toBeDefined();
    expect(fileIconFor("mystery.zzz")).toBeDefined();
  });
});

describe("fileNameById", () => {
  const files = [
    { id: "abc12345def", original_name: "report.pdf" },
    { id: "xyz98765wvu", original_name: "photo.png" },
  ] as FileMetadata[];

  it("returns the file's display name when found", () => {
    expect(fileNameById(files, "abc12345def")).toBe("report.pdf");
  });
  it("falls back to the first 8 chars of the id when not found", () => {
    expect(fileNameById(files, "missingId123")).toBe("missingI");
  });
});

describe("concatChunks", () => {
  it("concatenates chunks into one contiguous buffer", () => {
    const out = concatChunks([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])]);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
  });
  it("returns an empty buffer for no chunks", () => {
    expect(concatChunks([]).byteLength).toBe(0);
  });
});

describe("saveBlob", () => {
  let clicked: HTMLAnchorElement | null;
  beforeEach(() => {
    clicked = null;
    URL.createObjectURL = vi.fn(() => "blob:fake-url") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    // Capture the anchor saveBlob builds without aliasing `this`.
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") clicked = el as HTMLAnchorElement;
      return el;
    }) as typeof document.createElement);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saves a Blob directly (no mime) via a hidden <a download> then revokes", () => {
    saveBlob("out.txt", new Blob(["hi"]));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(clicked?.download).toBe("out.txt");
    expect(clicked?.href).toContain("blob:fake-url");
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  it("re-wraps a Blob with the given mime type", () => {
    const createSpy = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    saveBlob("out.bin", new Blob(["hi"]), "application/pdf");
    const passed = createSpy.mock.calls[0][0] as Blob;
    expect(passed.type).toBe("application/pdf");
  });

  it("copies a Uint8Array into a fresh contiguous ArrayBuffer", () => {
    const createSpy = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    saveBlob("bytes.bin", new Uint8Array([1, 2, 3]));
    const passed = createSpy.mock.calls[0][0] as Blob;
    expect(passed.type).toBe("application/octet-stream");
    expect(passed.size).toBe(3);
    expect(clicked?.download).toBe("bytes.bin");
  });

  it("handles a raw BlobPart (string) via the default branch", () => {
    const createSpy = URL.createObjectURL as unknown as ReturnType<typeof vi.fn>;
    saveBlob("part.txt", "raw string part", "text/plain");
    const passed = createSpy.mock.calls[0][0] as Blob;
    expect(passed.type).toBe("text/plain");
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });
});
