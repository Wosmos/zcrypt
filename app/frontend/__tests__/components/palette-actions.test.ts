import { describe, it, expect } from "vitest";
import { paletteActions, type PaletteActionContext } from "@/components/ui/palette-actions";

const base: PaletteActionContext = {
  unlocked: false,
  resolvedTheme: "dark",
  advancedMode: false,
  hasAppsDialog: true,
  hasKeyboard: true,
};

const byId = (ctx: PaletteActionContext, id: string) =>
  paletteActions(ctx).find((a) => a.id === id);

describe("paletteActions", () => {
  it("offers every action by default", () => {
    expect(paletteActions(base).map((a) => a.id)).toEqual([
      "upload",
      "newFolder",
      "toggleLock",
      "toggleTheme",
      "toggleAdvanced",
      "openSpaces",
      "newSpace",
      "getApps",
      "shortcuts",
    ]);
  });

  it("flips the lock label with the vault state", () => {
    expect(byId(base, "toggleLock")?.labelKey).toBe("ui.palette.action.unlock");
    expect(byId({ ...base, unlocked: true }, "toggleLock")?.labelKey).toBe(
      "ui.palette.action.lock",
    );
  });

  it("names the theme it will switch to", () => {
    expect(byId(base, "toggleTheme")?.labelKey).toBe("ui.theme.toLight");
    expect(byId({ ...base, resolvedTheme: "light" }, "toggleTheme")?.labelKey).toBe(
      "ui.theme.toDark",
    );
  });

  it("flips the advanced mode label", () => {
    expect(byId(base, "toggleAdvanced")?.labelKey).toBe("ui.palette.action.advancedOn");
    expect(byId({ ...base, advancedMode: true }, "toggleAdvanced")?.labelKey).toBe(
      "ui.palette.action.advancedOff",
    );
  });

  it("drops the apps dialog on desktop and the shortcuts sheet on touch devices", () => {
    const ids = paletteActions({ ...base, hasAppsDialog: false, hasKeyboard: false }).map(
      (a) => a.id,
    );
    expect(ids).not.toContain("getApps");
    expect(ids).not.toContain("shortcuts");
  });
});
