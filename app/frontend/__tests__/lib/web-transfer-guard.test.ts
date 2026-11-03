import { describe, it, expect, beforeEach, vi } from "vitest";
import type { QuotaInfo } from "@/types";

const h = vi.hoisted(() => ({
  tauri: false,
  quota: null as Partial<QuotaInfo> | null,
  resolveWebDirect: vi.fn(),
  show: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  get isTauri() {
    return h.tauri;
  },
}));
vi.mock("@/store/quota", () => ({ getQuotaData: () => h.quota }));
vi.mock("@/lib/byos-direct", () => ({ resolveWebDirect: h.resolveWebDirect }));
vi.mock("@/store/web-transfer-notice", () => ({
  useWebTransferNotice: { getState: () => ({ show: h.show }) },
}));

import { showWebTransferLimit, webFileLimitFor } from "@/lib/web-transfer-guard";
import { WebTransferLimitCode, WebTransferLimitError } from "@/lib/web-transfer-limit";

const LIMIT = 2000;

beforeEach(() => {
  h.tauri = false;
  h.quota = { relay_max_file_bytes: LIMIT };
  h.resolveWebDirect.mockReset().mockResolvedValue(null);
  h.show.mockReset();
});

describe("webFileLimitFor", () => {
  it("holds back a web upload over the limit", async () => {
    const err = await webFileLimitFor(LIMIT + 1, undefined);
    expect(err).toBeInstanceOf(WebTransferLimitError);
    expect(err?.code).toBe(WebTransferLimitCode.FileTooLarge);
    expect(err?.info.limitBytes).toBe(LIMIT);
    expect(err?.status).toBe(413);
    expect(h.resolveWebDirect).toHaveBeenCalledWith(undefined);
  });

  it("lets a file go through that would upload straight to the user's own Telegram", async () => {
    h.resolveWebDirect.mockResolvedValue({ platform: "telegram" });
    expect(await webFileLimitFor(LIMIT + 1, "telegram")).toBeNull();
    expect(h.resolveWebDirect).toHaveBeenCalledWith("telegram");
  });

  it("allows files at or under the limit without asking about direct uploads", async () => {
    expect(await webFileLimitFor(LIMIT, undefined)).toBeNull();
    expect(h.resolveWebDirect).not.toHaveBeenCalled();
  });

  it("does nothing when there is no limit or the quota has not loaded", async () => {
    h.quota = { relay_max_file_bytes: 0 };
    expect(await webFileLimitFor(LIMIT * 10, undefined)).toBeNull();
    h.quota = {};
    expect(await webFileLimitFor(LIMIT * 10, undefined)).toBeNull();
    h.quota = null;
    expect(await webFileLimitFor(LIMIT * 10, undefined)).toBeNull();
    expect(h.resolveWebDirect).not.toHaveBeenCalled();
  });

  it("never holds back HuggingFace, which the browser uploads to directly", async () => {
    expect(await webFileLimitFor(LIMIT + 1, "huggingface")).toBeNull();
    expect(h.resolveWebDirect).not.toHaveBeenCalled();
  });

  it("never holds back the desktop app", async () => {
    h.tauri = true;
    expect(await webFileLimitFor(LIMIT + 1, undefined)).toBeNull();
    expect(h.resolveWebDirect).not.toHaveBeenCalled();
  });
});

describe("showWebTransferLimit", () => {
  it("opens the desktop app dialog for the refused file and its batch", () => {
    const err = new WebTransferLimitError(WebTransferLimitCode.FileTooLarge, { limitBytes: LIMIT }, 413);
    const file = { name: "big.bin", size: LIMIT + 1 };
    showWebTransferLimit(err.limit, file, "batch-1");
    expect(h.show).toHaveBeenCalledWith(
      { code: WebTransferLimitCode.FileTooLarge, limitBytes: LIMIT },
      file,
      "batch-1",
    );
  });
});
