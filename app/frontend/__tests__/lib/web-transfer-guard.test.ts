import { describe, it, expect, beforeEach, vi } from "vitest";
import type { QuotaInfo } from "@/types";

const h = vi.hoisted(() => ({
  tauri: false,
  quota: null as Partial<QuotaInfo> | null,
  resolveWebDirect: vi.fn(),
  toastError: vi.fn(),
  action: { label: "Open the desktop app", onClick: vi.fn() },
}));

vi.mock("@/lib/tauri", () => ({
  get isTauri() {
    return h.tauri;
  },
}));
vi.mock("@/store/quota", () => ({ getQuotaData: () => h.quota }));
vi.mock("@/lib/byos-direct", () => ({ resolveWebDirect: h.resolveWebDirect }));
vi.mock("@/store/toast", () => ({ toast: { error: h.toastError } }));
vi.mock("@/lib/open-desktop-app", () => ({ desktopAppAction: () => h.action }));

import { showWebTransferLimit, webFileLimitFor } from "@/lib/web-transfer-guard";
import { WebTransferLimitCode, WebTransferLimitError } from "@/lib/web-transfer-limit";

const LIMIT = 2000;

beforeEach(() => {
  h.tauri = false;
  h.quota = { relay_max_file_bytes: LIMIT };
  h.resolveWebDirect.mockReset().mockResolvedValue(null);
  h.toastError.mockReset();
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
  it("shows the friendly message with the way into the desktop app and the hand-off hint", () => {
    const err = new WebTransferLimitError(WebTransferLimitCode.FileTooLarge, { limitBytes: LIMIT }, 413);
    showWebTransferLimit(err);
    expect(h.toastError).toHaveBeenCalledWith(err.message, h.action, {
      key: "web-transfer-limit:relay_file_too_large",
      detail: "The browser can't hand the file to the app. Open the app and drop the file there.",
    });
  });
});
