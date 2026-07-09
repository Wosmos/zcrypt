import { describe, it, expect, afterEach, vi } from "vitest";
import { copyToClipboard } from "@/lib/clipboard";

function setClipboard(value: unknown) {
  Object.defineProperty(navigator, "clipboard", {
    value,
    configurable: true,
    writable: true,
  });
}

describe("copyToClipboard", () => {
  afterEach(() => {
    setClipboard(undefined);
    // Remove the execCommand override if a test set one.
    delete (document as { execCommand?: unknown }).execCommand;
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("uses the async Clipboard API when available and returns true", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard({ writeText });
    const exec = vi.fn(() => true);
    document.execCommand = exec;

    await expect(copyToClipboard("hello")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("hello");
    expect(exec).not.toHaveBeenCalled();
  });

  it("falls back to execCommand when the Clipboard API rejects", async () => {
    setClipboard({ writeText: vi.fn().mockRejectedValue(new Error("blocked")) });
    document.execCommand = vi.fn(() => true);

    await expect(copyToClipboard("x")).resolves.toBe(true);
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    // The temporary textarea must be cleaned up.
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back to execCommand when the Clipboard API is unavailable", async () => {
    setClipboard(undefined);
    const exec = vi.fn(() => true);
    document.execCommand = exec;

    await expect(copyToClipboard("plain-http")).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
  });

  it("returns whatever execCommand reports (false)", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => false);
    await expect(copyToClipboard("x")).resolves.toBe(false);
  });

  it("returns false when the fallback throws", async () => {
    setClipboard(undefined);
    document.execCommand = vi.fn(() => {
      throw new Error("execCommand exploded");
    });
    await expect(copyToClipboard("x")).resolves.toBe(false);
  });
});
