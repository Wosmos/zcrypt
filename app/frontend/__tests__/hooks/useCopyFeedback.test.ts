import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCopyFeedback } from "@/hooks/useCopyFeedback";
import { copyToClipboard } from "@/lib/clipboard";

vi.mock("@/lib/clipboard", () => ({
  copyToClipboard: vi.fn().mockResolvedValue(true),
}));

const copyMock = vi.mocked(copyToClipboard);

describe("useCopyFeedback", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    copyMock.mockClear();
    copyMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("starts not-copied", () => {
    const { result } = renderHook(() => useCopyFeedback("hello"));
    expect(result.current.copied).toBe(false);
  });

  it("does nothing when the value is empty", async () => {
    const { result } = renderHook(() => useCopyFeedback(""));
    await act(async () => {
      await result.current.handleCopy();
    });
    expect(copyMock).not.toHaveBeenCalled();
    expect(result.current.copied).toBe(false);
  });

  it("copies the value and flips copied true, then resets after 2s", async () => {
    const { result } = renderHook(() => useCopyFeedback("secret"));

    await act(async () => {
      await result.current.handleCopy();
    });
    expect(copyMock).toHaveBeenCalledWith("secret");
    expect(result.current.copied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.copied).toBe(false);
  });

  it("reset() flips copied back to false immediately", async () => {
    const { result } = renderHook(() => useCopyFeedback("x"));
    await act(async () => {
      await result.current.handleCopy();
    });
    expect(result.current.copied).toBe(true);

    act(() => {
      result.current.reset();
    });
    expect(result.current.copied).toBe(false);
  });
});
