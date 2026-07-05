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
});
