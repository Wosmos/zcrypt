import { beforeEach, describe, expect, it, vi } from "vitest";

const { notifyMock, toastMock } = vi.hoisted(() => ({
  notifyMock: vi.fn(async (_event: import("@/lib/notify").NotifyEvent) => true),
  toastMock: { warning: vi.fn(), info: vi.fn() },
}));
vi.mock("@/lib/notify", () => ({ notify: notifyMock }));
vi.mock("@/store/toast", () => ({ toast: toastMock }));

import {
  announceInviteReceived,
  announceLinkViewed,
  announceNewSignIn,
  announceStorageFull,
} from "@/lib/announce";

beforeEach(() => {
  notifyMock.mockClear();
  toastMock.warning.mockClear();
  toastMock.info.mockClear();
});

describe("announce", () => {
  it("warns about a new sign-in with a security heads-up and an OS notification", () => {
    announceNewSignIn("Chrome · Windows");
    expect(toastMock.warning).toHaveBeenCalledWith("New sign-in to your account", {
      detail: "Chrome · Windows. Not you? Sign it out in Settings.",
      key: "announce:sign-in",
      sound: { event: "headsUp", area: "security" },
    });
    expect(notifyMock).toHaveBeenCalledWith({ type: "newSignIn", device: "Chrome · Windows" });
  });

  it("warns that storage is full", () => {
    announceStorageFull();
    expect(toastMock.warning).toHaveBeenCalledWith(
      "Your storage is full",
      expect.objectContaining({ sound: { event: "headsUp", area: "transfers" } }),
    );
    expect(notifyMock).toHaveBeenCalledWith({ type: "storageFull" });
  });

  it("tells about an invite and an opened link under Sharing", () => {
    announceInviteReceived("Trips");
    announceLinkViewed("Lease.pdf");
    expect(toastMock.info).toHaveBeenNthCalledWith(1, "You were invited to Trips", {
      detail: "Open zcrypt to accept or decline.",
      key: "announce:invite:Trips",
      sound: { event: "headsUp", area: "sharing" },
    });
    expect(toastMock.info).toHaveBeenNthCalledWith(2, "Someone opened your link", {
      detail: "Lease.pdf",
      key: "announce:link:Lease.pdf",
      sound: { event: "headsUp", area: "sharing" },
    });
    expect(notifyMock).toHaveBeenCalledWith({ type: "inviteReceived", space: "Trips" });
    expect(notifyMock).toHaveBeenCalledWith({ type: "linkViewed", name: "Lease.pdf" });
  });
});
