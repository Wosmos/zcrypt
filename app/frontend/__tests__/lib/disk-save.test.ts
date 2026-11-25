import { afterEach, describe, expect, it, vi } from "vitest";
import {
  STREAM_TO_DISK_MIN_BYTES,
  canStreamToDisk,
  chooseDiskWriter,
  getSaveFilePicker,
} from "@/lib/disk-save";

type WithPicker = { showSaveFilePicker?: unknown };

afterEach(() => {
  delete (window as unknown as WithPicker).showSaveFilePicker;
});

function installPicker(picker: unknown) {
  (window as unknown as WithPicker).showSaveFilePicker = picker;
}

describe("getSaveFilePicker / canStreamToDisk", () => {
  it("reports no picker in a browser without one", () => {
    expect(getSaveFilePicker()).toBeUndefined();
    expect(canStreamToDisk()).toBe(false);
  });

  it("returns the browser's picker when it has one", () => {
    const picker = vi.fn();
    installPicker(picker);
    expect(getSaveFilePicker()).toBe(picker);
    expect(canStreamToDisk()).toBe(true);
  });
});

describe("chooseDiskWriter", () => {
  it("keeps a small file in memory without opening the picker", async () => {
    const picker = vi.fn();
    installPicker(picker);
    expect(await chooseDiskWriter("a.bin", STREAM_TO_DISK_MIN_BYTES - 1)).toEqual({ kind: "memory" });
    expect(picker).not.toHaveBeenCalled();
  });

  it("is unsupported for a big file when the browser has no picker", async () => {
    expect(await chooseDiskWriter("a.bin", STREAM_TO_DISK_MIN_BYTES)).toEqual({ kind: "unsupported" });
  });

  it("opens the picker with the suggested name and returns the writable for a big file", async () => {
    const writer = { write: vi.fn(), close: vi.fn() };
    const picker = vi.fn(async () => ({ createWritable: async () => writer }));
    installPicker(picker);
    expect(await chooseDiskWriter("big.bin", STREAM_TO_DISK_MIN_BYTES)).toEqual({ kind: "disk", writer });
    expect(picker).toHaveBeenCalledWith({ suggestedName: "big.bin" });
  });

  it("is cancelled when the person dismisses the picker", async () => {
    installPicker(async () => {
      throw new DOMException("dismissed", "AbortError");
    });
    expect(await chooseDiskWriter("big.bin", STREAM_TO_DISK_MIN_BYTES)).toEqual({ kind: "cancelled" });
  });

  it("is unsupported when the picker fails for any other reason, such as a lost gesture", async () => {
    installPicker(async () => {
      throw new DOMException("no activation", "SecurityError");
    });
    expect(await chooseDiskWriter("big.bin", STREAM_TO_DISK_MIN_BYTES)).toEqual({ kind: "unsupported" });
    installPicker(async () => {
      throw new Error("boom");
    });
    expect(await chooseDiskWriter("big.bin", STREAM_TO_DISK_MIN_BYTES)).toEqual({ kind: "unsupported" });
  });
});
