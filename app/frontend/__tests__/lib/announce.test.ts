import { beforeEach, describe, expect, it, vi } from "vitest";

const { notifyMock, toastMock, bg } = vi.hoisted(() => ({
  notifyMock: vi.fn(async (_event: import("@/lib/notify").NotifyEvent) => true),
  toastMock: { warning: vi.fn(), info: vi.fn() },
  bg: { value: false },
}));
vi.mock("@/lib/notify", () => ({ notify: notifyMock }));
vi.mock("@/store/toast", () => ({ toast: toastMock }));
vi.mock("@/lib/sounds", () => ({ isInBackground: () => bg.value }));

import { announceStorageFull } from "@/lib/announce";

beforeEach(() => {
  notifyMock.mockClear();
  toastMock.warning.mockClear();
  bg.value = false;
});

describe("announceStorageFull", () => {
  it("shows a toast, and no system notification, while zcrypt is in view", () => {
    announceStorageFull();
    expect(toastMock.warning).toHaveBeenCalledWith(
      "Your storage is full",
      expect.objectContaining({ sound: { event: "headsUp", area: "transfers" } }),
    );
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it("sends a system notification, and no toast, while zcrypt is hidden", () => {
    bg.value = true;
    announceStorageFull();
    expect(notifyMock).toHaveBeenCalledWith({ type: "storageFull" });
    expect(toastMock.warning).not.toHaveBeenCalled();
  });
});
