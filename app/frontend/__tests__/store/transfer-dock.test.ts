import { describe, it, expect, beforeEach } from "vitest";
import { useTransferDockStore } from "@/store/transfer-dock";

describe("useTransferDockStore", () => {
  beforeEach(() => {
    useTransferDockStore.setState({ visible: false, height: 0 });
  });

  it("starts hidden with zero height", () => {
    const { visible, height } = useTransferDockStore.getState();
    expect(visible).toBe(false);
    expect(height).toBe(0);
  });

  it("report() updates both visible and height", () => {
    useTransferDockStore.getState().report(true, 240);
    const { visible, height } = useTransferDockStore.getState();
    expect(visible).toBe(true);
    expect(height).toBe(240);
  });

  it("report() with the same values is a no-op (same state object)", () => {
    useTransferDockStore.getState().report(true, 120);
    const before = useTransferDockStore.getState();

    useTransferDockStore.getState().report(true, 120);
    const after = useTransferDockStore.getState();

    // The dedup branch returns the previous state, so the object identity
    // is preserved (no re-render churn for the FAB subscriber).
    expect(after).toBe(before);
    expect(after.visible).toBe(true);
    expect(after.height).toBe(120);
  });

  it("report() produces a new state object when height changes", () => {
    useTransferDockStore.getState().report(true, 120);
    const before = useTransferDockStore.getState();

    useTransferDockStore.getState().report(true, 200);
    const after = useTransferDockStore.getState();

    expect(after).not.toBe(before);
    expect(after.height).toBe(200);
  });

  it("report() produces a new state object when visibility changes", () => {
    useTransferDockStore.getState().report(true, 120);
    const before = useTransferDockStore.getState();

    useTransferDockStore.getState().report(false, 120);
    const after = useTransferDockStore.getState();

    expect(after).not.toBe(before);
    expect(after.visible).toBe(false);
    expect(after.height).toBe(120);
  });

  it("holds the page's drop target and clears it", () => {
    const target = { folderName: "Family", upload: () => {}, download: () => {} };
    useTransferDockStore.getState().setDropTarget(target);
    expect(useTransferDockStore.getState().dropTarget).toBe(target);
    useTransferDockStore.getState().setDropTarget(null);
    expect(useTransferDockStore.getState().dropTarget).toBeNull();
  });

  it("remembers folder names and skips no-op writes", () => {
    useTransferDockStore.getState().rememberFolder("f1", "Family");
    const before = useTransferDockStore.getState();
    expect(before.folderNames.f1).toBe("Family");
    useTransferDockStore.getState().rememberFolder("f1", "Family");
    expect(useTransferDockStore.getState()).toBe(before);
    useTransferDockStore.getState().rememberFolder("f1", "Trips");
    expect(useTransferDockStore.getState().folderNames.f1).toBe("Trips");
  });

  it("records bars as high-water marks, drops gone rows, and skips no-op writes", () => {
    useTransferDockStore.setState({ bars: {} });
    useTransferDockStore.getState().recordBars({ a: 40, b: 10 });
    useTransferDockStore.getState().recordBars({ a: 20, b: 10 });
    expect(useTransferDockStore.getState().bars).toEqual({ a: 40, b: 10 });
    const before = useTransferDockStore.getState();
    useTransferDockStore.getState().recordBars({ a: 40, b: 10 });
    expect(useTransferDockStore.getState()).toBe(before);
    useTransferDockStore.getState().recordBars({ a: 50 });
    expect(useTransferDockStore.getState().bars).toEqual({ a: 50 });
  });
});
