import { describe, it, expect, beforeEach } from "vitest";
import { usePendingAction } from "@/store/pending-action";
import { parseVaultCollection } from "@/store/vault-view";

describe("usePendingAction", () => {
  beforeEach(() => usePendingAction.getState().clear());

  it("holds a requested action until it is cleared", () => {
    usePendingAction.getState().request("upload");
    expect(usePendingAction.getState().pending).toBe("upload");
    usePendingAction.getState().clear();
    expect(usePendingAction.getState().pending).toBeNull();
  });

  it("keeps only the latest request", () => {
    usePendingAction.getState().request("upload");
    usePendingAction.getState().request("newFolder");
    expect(usePendingAction.getState().pending).toBe("newFolder");
  });
});

describe("parseVaultCollection", () => {
  it("accepts only known collections", () => {
    expect(parseVaultCollection("recents")).toBe("recents");
    expect(parseVaultCollection("starred")).toBe("starred");
    expect(parseVaultCollection("other")).toBeNull();
    expect(parseVaultCollection(null)).toBeNull();
  });
});
