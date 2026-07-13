import { describe, it, expect } from "vitest";
import { getFolderIcon, getFolderInitial, getIconByKey, FOLDER_ICON_OPTIONS } from "@/lib/folder-icons";
import { FileText, ImageSquare, Monitor } from "@phosphor-icons/react";

describe("getIconByKey", () => {
  it("resolves a known option key to its glyph", () => {
    const opt = FOLDER_ICON_OPTIONS[0];
    expect(getIconByKey(opt.key)).toBe(opt.Icon);
  });

  it("returns null for an unknown/legacy key", () => {
    expect(getIconByKey("no-such-icon-key")).toBeNull();
  });
});

describe("getFolderIcon", () => {
  it("matches a full normalized name exactly", () => {
    expect(getFolderIcon("Documents")).toBe(FileText);
  });

  it("matches a contained word within a longer name", () => {
    expect(getFolderIcon("My Photos Folder")).toBe(ImageSquare);
  });

  it("matches a singular key from a plural word", () => {
    // "desktop" is a key, "desktops" is not — exercises the trailing-"s" strip.
    expect(getFolderIcon("Desktops")).toBe(Monitor);
  });

  it("is case-insensitive and ignores punctuation/casing", () => {
    expect(getFolderIcon("  DOWNLOADS!!  ")).toBe(getFolderIcon("downloads"));
  });

  it("returns null when nothing matches", () => {
    expect(getFolderIcon("Xyzzy Foobar Quux")).toBeNull();
  });

  it("returns null for a name with no alphanumeric content", () => {
    expect(getFolderIcon("   !!!---   ")).toBeNull();
    expect(getFolderIcon("")).toBeNull();
  });

  it("does not match a plural whose singular is not a real key", () => {
    // "torrents" is a key itself, but "torrent" alone (no plural in RULES)
    // singular-stripping only applies when the word itself isn't already a hit.
    expect(getFolderIcon("torrent")).toBeNull();
  });
});

describe("getFolderInitial", () => {
  it("returns the uppercased first alphanumeric character", () => {
    expect(getFolderInitial("documents")).toBe("D");
    expect(getFolderInitial("123abc")).toBe("1");
  });

  it("skips leading whitespace", () => {
    expect(getFolderInitial("  hello")).toBe("H");
  });

  it("falls back to # when there is no alphanumeric character", () => {
    expect(getFolderInitial("!!!")).toBe("#");
    expect(getFolderInitial("")).toBe("#");
  });
});
