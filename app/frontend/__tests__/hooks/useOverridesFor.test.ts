import { describe, it, expect } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useOverridesFor } from "@/hooks/useOverridesFor";

describe("useOverridesFor", () => {
  it("starts empty and applies updates against the current base", () => {
    const base = [1];
    const { result } = renderHook(() => useOverridesFor<boolean>(base));
    expect(result.current[0]).toEqual({});

    act(() => result.current[1]((prev) => ({ ...prev, a: true })));
    act(() => result.current[1]((prev) => ({ ...prev, b: false })));
    expect(result.current[0]).toEqual({ a: true, b: false });
  });

  it("drops overrides when a new base arrives", () => {
    const { result, rerender } = renderHook(({ base }) => useOverridesFor<boolean>(base), {
      initialProps: { base: [1] as unknown },
    });
    act(() => result.current[1]((prev) => ({ ...prev, a: true })));
    expect(result.current[0]).toEqual({ a: true });

    rerender({ base: [2] });
    expect(result.current[0]).toEqual({});
  });

  it("an update made against an old base starts from nothing on the new one", () => {
    const { result, rerender } = renderHook(({ base }) => useOverridesFor<boolean>(base), {
      initialProps: { base: [1] as unknown },
    });
    const staleUpdate = result.current[1];
    act(() => staleUpdate((prev) => ({ ...prev, a: true })));

    rerender({ base: [2] });
    act(() => result.current[1]((prev) => ({ ...prev, b: true })));
    expect(result.current[0]).toEqual({ b: true });
  });
});
