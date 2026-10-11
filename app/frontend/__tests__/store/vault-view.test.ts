import { describe, it, expect } from "vitest";
import { parseVaultCollection, useVaultView } from "@/store/vault-view";

describe("vault view", () => {
  it("accepts only the known collections", () => {
    expect(parseVaultCollection("recents")).toBe("recents");
    expect(parseVaultCollection("starred")).toBe("starred");
    expect(parseVaultCollection("trash")).toBeNull();
    expect(parseVaultCollection(null)).toBeNull();
  });

  it("stores the selected collection and clears it", () => {
    expect(useVaultView.getState().collection).toBeNull();
    useVaultView.getState().setCollection("starred");
    expect(useVaultView.getState().collection).toBe("starred");
    useVaultView.getState().setCollection(null);
    expect(useVaultView.getState().collection).toBeNull();
  });
});
