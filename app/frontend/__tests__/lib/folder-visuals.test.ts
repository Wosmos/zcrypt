import { describe, it, expect } from "vitest";
import { folderVisuals } from "@/lib/folder-visuals";
import { BACKGROUND_DESIGNS } from "@/lib/background-presets";
import { FOLDER_ICON_OPTIONS } from "@/lib/folder-icons";
import type { DecryptedFolder } from "@/hooks/useFolders";

function folder(over: Partial<DecryptedFolder>): DecryptedFolder {
  return {
    id: "f",
    user_id: "u",
    parent_id: null,
    encrypted_name: "",
    created_at: "t",
    name: "Docs",
    protected: false,
    style: null,
    ...over,
  } as DecryptedFolder;
}

describe("folderVisuals", () => {
  it("locked folder → no glyph, empty initial, no custom bg/color", () => {
    const v = folderVisuals(folder({ protected: true, name: "Secret", style: { color: "#f00" } }));
    expect(v.isLocked).toBe(true);
    expect(v.FolderGlyph).toBeNull();
    expect(v.initial).toBe("");
    expect(v.customBackground).toBeUndefined();
    expect(v.customColor).toBeUndefined();
  });

  it("treats a [locked] name as locked even when not password-protected", () => {
    expect(folderVisuals(folder({ name: "[locked]" })).isLocked).toBe(true);
  });

  it("unlocked → derives a name glyph and initial", () => {
    const v = folderVisuals(folder({ name: "Documents" }));
    expect(v.isLocked).toBe(false);
    expect(v.FolderGlyph).toBeTruthy();
    expect(v.initial).toBe("D");
  });

  it("uses a custom icon key when one is set", () => {
    const opt = FOLDER_ICON_OPTIONS[0];
    expect(folderVisuals(folder({ style: { icon: opt.key } })).FolderGlyph).toBe(opt.Icon);
  });

  it("resolves a custom background key to its CSS", () => {
    const design = BACKGROUND_DESIGNS[0];
    const v = folderVisuals(folder({ style: { background: design.key } }));
    expect(v.customBackground).toBe(design.css);
  });

  it("returns a custom color when set without a background", () => {
    const v = folderVisuals(folder({ style: { color: "#00ff00" } }));
    expect(v.customBackground).toBeUndefined();
    expect(v.customColor).toBe("#00ff00");
  });
});
