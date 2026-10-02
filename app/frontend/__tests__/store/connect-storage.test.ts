import { describe, it, expect } from "vitest";
import { useConnectStorage } from "@/store/connect-storage";

describe("useConnectStorage", () => {
  it("opens and closes the dialog", () => {
    expect(useConnectStorage.getState().open).toBe(false);
    useConnectStorage.getState().show();
    expect(useConnectStorage.getState().open).toBe(true);
    useConnectStorage.getState().hide();
    expect(useConnectStorage.getState().open).toBe(false);
  });
});
