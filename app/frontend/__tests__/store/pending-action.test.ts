import { describe, it, expect, beforeEach } from "vitest";
import { usePendingAction } from "@/store/pending-action";

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

