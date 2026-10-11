import { afterEach, describe, expect, it, vi } from "vitest";
import { LATEST_RELEASED_VERSION } from "@/lib/changelog";
import {
  decideWhatsNew,
  markVersionSeen,
  readSeenVersion,
  resolveWhatsNewVersion,
} from "@/lib/whats-new";
import { selectWhatsNewUnread, useWhatsNewStore } from "@/store/whats-new";

describe("whats-new storage", () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("remembers the last seen version per user", () => {
    expect(readSeenVersion("u1")).toBeNull();
    markVersionSeen("u1", "0.1.7");
    expect(readSeenVersion("u1")).toBe("0.1.7");
    expect(readSeenVersion("u2")).toBeNull();
  });

  it("survives blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readSeenVersion("u1")).toBeNull();
    expect(() => markVersionSeen("u1", "0.1.7")).not.toThrow();
  });
});

describe("whats-new decisions", () => {
  it("does not greet a first-ever visit", () => {
    expect(decideWhatsNew(null, "0.1.7")).toBe("first-visit");
  });
  it("shows once after the version changes, then stays quiet", () => {
    expect(decideWhatsNew("0.1.6", "0.1.7")).toBe("show");
    expect(decideWhatsNew("0.1.7", "0.1.7")).toBe("seen");
  });
  it("uses the app's own released version, else the latest", () => {
    expect(resolveWhatsNewVersion("0.1.6")).toBe("0.1.6");
    expect(resolveWhatsNewVersion("0.1.8")).toBe(LATEST_RELEASED_VERSION);
    expect(resolveWhatsNewVersion("9.9.9")).toBe(LATEST_RELEASED_VERSION);
    expect(resolveWhatsNewVersion(null)).toBe(LATEST_RELEASED_VERSION);
  });
});

describe("whats-new store", () => {
  it("is unread only when a known older version was seen", () => {
    const s = useWhatsNewStore;
    s.setState({ open: false, version: null, seen: null });
    expect(selectWhatsNewUnread(s.getState())).toBe(false);
    s.getState().init("0.1.7", "0.1.6");
    expect(selectWhatsNewUnread(s.getState())).toBe(true);
    s.getState().setOpen(true);
    expect(s.getState().open).toBe(true);
    s.getState().markSeen();
    expect(selectWhatsNewUnread(s.getState())).toBe(false);
    s.getState().init("0.1.7", null);
    expect(selectWhatsNewUnread(s.getState())).toBe(false);
  });
});
