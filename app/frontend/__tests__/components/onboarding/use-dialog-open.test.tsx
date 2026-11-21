import { afterEach, describe, expect, it } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useDialogOpen } from "@/components/onboarding/tour-provider";

function addDialog(attrs: Record<string, string>) {
  const el = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  return el;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("useDialogOpen", () => {
  it("turns on while an app dialog is open and off once it closes", async () => {
    const { result } = renderHook(() => useDialogOpen(true));
    expect(result.current).toBe(false);

    const dialog = addDialog({ role: "dialog", "data-state": "open" });
    await waitFor(() => expect(result.current).toBe(true));

    act(() => dialog.setAttribute("data-state", "closed"));
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("sees an open alert dialog too", async () => {
    addDialog({ role: "alertdialog", "data-state": "open" });
    const { result } = renderHook(() => useDialogOpen(true));
    await waitFor(() => expect(result.current).toBe(true));
  });

  it("ignores the tour's own card, which carries no open state", async () => {
    addDialog({ role: "dialog", "aria-modal": "true" });
    const { result } = renderHook(() => useDialogOpen(true));
    await new Promise((r) => setTimeout(r, 50));
    expect(result.current).toBe(false);
  });

  it("stays off and stops watching when the tour is not showing", async () => {
    const { result, rerender } = renderHook(({ watch }) => useDialogOpen(watch), {
      initialProps: { watch: true },
    });
    addDialog({ role: "dialog", "data-state": "open" });
    await waitFor(() => expect(result.current).toBe(true));
    rerender({ watch: false });
    await waitFor(() => expect(result.current).toBe(false));
  });
});
