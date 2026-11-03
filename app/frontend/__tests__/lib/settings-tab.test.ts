import { describe, it, expect } from "vitest";
import { requestedSettingsTab, settingsTabHref } from "@/lib/settings-tab";

describe("requestedSettingsTab", () => {
  it("reads ?tab= for every tab", () => {
    for (const tab of ["appearance", "storage", "platforms", "sessions", "updates"]) {
      expect(requestedSettingsTab(new URLSearchParams(`tab=${tab}`))).toBe(tab);
    }
  });

  it("still reads older ?section= links, with ?tab= winning", () => {
    expect(requestedSettingsTab(new URLSearchParams("section=updates"))).toBe("updates");
    expect(requestedSettingsTab(new URLSearchParams("section=updates&tab=storage"))).toBe("storage");
  });

  it("asks for nothing without either", () => {
    expect(requestedSettingsTab(new URLSearchParams(""))).toBeNull();
  });
});

describe("settingsTabHref", () => {
  it("puts the open tab in the address and keeps everything else", () => {
    expect(settingsTabHref("https://zcrypt.app/settings?x=1#top", "storage")).toBe(
      "/settings?x=1&tab=storage#top",
    );
  });

  it("replaces an older ?section= and drops the tab when none is open", () => {
    expect(settingsTabHref("https://zcrypt.app/settings?section=updates", "sessions")).toBe(
      "/settings?tab=sessions",
    );
    expect(settingsTabHref("https://zcrypt.app/settings?tab=storage", null)).toBe("/settings");
  });
});
