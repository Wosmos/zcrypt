import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useFeedbackTrigger } from "@/hooks/useFeedbackTrigger";

const { getFeedbackStatus } = vi.hoisted(() => ({
  getFeedbackStatus: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ getFeedbackStatus }));

const DISMISSED_KEY = "zcrypt_feedback_dismissed";
const MIN_USAGE_BYTES = 500 * 1024 * 1024;

describe("useFeedbackTrigger", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("stays hidden and never calls the server when already dismissed this session", async () => {
    sessionStorage.setItem(DISMISSED_KEY, "1");
    const { result } = renderHook(() => useFeedbackTrigger(MIN_USAGE_BYTES, 0));

    expect(result.current.showFeedback).toBe(false);
    expect(getFeedbackStatus).not.toHaveBeenCalled();
  });

  it("stays hidden and never calls the server when usage is below both thresholds", async () => {
    const { result } = renderHook(() => useFeedbackTrigger(100, 1_000_000));

    expect(result.current.showFeedback).toBe(false);
    expect(getFeedbackStatus).not.toHaveBeenCalled();
  });

  it("checks the server when usage crosses the absolute 500MB threshold", async () => {
    getFeedbackStatus.mockResolvedValueOnce({ submitted: false });
    const { result } = renderHook(() => useFeedbackTrigger(MIN_USAGE_BYTES, 0));

    await waitFor(() => expect(result.current.showFeedback).toBe(true));
    expect(getFeedbackStatus).toHaveBeenCalledTimes(1);
  });

  it("checks the server when usage crosses the 50% quota threshold", async () => {
    getFeedbackStatus.mockResolvedValueOnce({ submitted: false });
    const { result } = renderHook(() => useFeedbackTrigger(50, 100));

    await waitFor(() => expect(result.current.showFeedback).toBe(true));
  });

  it("does not show feedback when the server reports it was already submitted", async () => {
    getFeedbackStatus.mockResolvedValueOnce({ submitted: true });
    const { result } = renderHook(() => useFeedbackTrigger(MIN_USAGE_BYTES, 0));

    await waitFor(() => expect(getFeedbackStatus).toHaveBeenCalledTimes(1));
    expect(result.current.showFeedback).toBe(false);
  });

  it("silently swallows a network error from the status check", async () => {
    getFeedbackStatus.mockRejectedValueOnce(new Error("network down"));
    const { result } = renderHook(() => useFeedbackTrigger(MIN_USAGE_BYTES, 0));

    await waitFor(() => expect(getFeedbackStatus).toHaveBeenCalledTimes(1));
    expect(result.current.showFeedback).toBe(false);
  });

  it("does not re-check quotaBytes=0 as a 50% match (guarded by quotaBytes > 0)", async () => {
    const { result } = renderHook(() => useFeedbackTrigger(0, 0));
    expect(result.current.showFeedback).toBe(false);
    expect(getFeedbackStatus).not.toHaveBeenCalled();
  });

  it("dismiss hides the modal and records the session dismissal", async () => {
    getFeedbackStatus.mockResolvedValueOnce({ submitted: false });
    const { result } = renderHook(() => useFeedbackTrigger(MIN_USAGE_BYTES, 0));
    await waitFor(() => expect(result.current.showFeedback).toBe(true));

    act(() => result.current.dismiss());

    expect(result.current.showFeedback).toBe(false);
    expect(sessionStorage.getItem(DISMISSED_KEY)).toBe("1");
  });

  it("markSubmitted hides the modal and records the session dismissal", async () => {
    getFeedbackStatus.mockResolvedValueOnce({ submitted: false });
    const { result } = renderHook(() => useFeedbackTrigger(MIN_USAGE_BYTES, 0));
    await waitFor(() => expect(result.current.showFeedback).toBe(true));

    act(() => result.current.markSubmitted());

    expect(result.current.showFeedback).toBe(false);
    expect(sessionStorage.getItem(DISMISSED_KEY)).toBe("1");
  });

  it("does not re-check once already checked, even if props are re-rendered with new values", async () => {
    getFeedbackStatus.mockResolvedValueOnce({ submitted: true });
    const { result, rerender } = renderHook(
      ({ used, quota }) => useFeedbackTrigger(used, quota),
      { initialProps: { used: 0, quota: 0 } }
    );
    expect(result.current.showFeedback).toBe(false);
    expect(getFeedbackStatus).not.toHaveBeenCalled();

    // Below-threshold render marks `checked` true synchronously; a later
    // re-render with different props must not re-trigger the effect's checks.
    rerender({ used: MIN_USAGE_BYTES, quota: 0 });
    expect(getFeedbackStatus).not.toHaveBeenCalled();
  });
});
