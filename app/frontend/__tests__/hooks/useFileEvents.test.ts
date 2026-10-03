import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { StreamObserver } from "@/lib/event-stream";

type Listeners = Record<string, (e: { data: string }) => void>;
const subs: { listeners: Listeners; observer: StreamObserver; unsubscribe: ReturnType<typeof vi.fn> }[] = [];

vi.mock("@/lib/event-stream", () => ({
  subscribeEvents: vi.fn((listeners: Listeners, observer: StreamObserver) => {
    const unsubscribe = vi.fn();
    subs.push({ listeners, observer, unsubscribe });
    return unsubscribe;
  }),
}));

vi.mock("@/lib/api", () => ({
  CHANGES_PAGE_LIMIT: 3,
  getChanges: vi.fn(),
}));

vi.mock("@/lib/invalidate", () => ({
  invalidateFilesViews: vi.fn(() => Promise.resolve()),
  applyFileEvents: vi.fn(() => Promise.resolve()),
}));

let mockAccessToken: string | null = "token";
vi.mock("@/store/auth", () => ({
  useAuthStore: (selector: (s: { accessToken: string | null }) => unknown) =>
    selector({ accessToken: mockAccessToken }),
}));

import { useFileEvents } from "@/hooks/useFileEvents";
import { subscribeEvents } from "@/lib/event-stream";
import { getChanges } from "@/lib/api";
import { invalidateFilesViews, applyFileEvents } from "@/lib/invalidate";

const latest = () => subs.at(-1)!;
const emit = (data: string) => latest().listeners.file!({ data });
const reopen = () => latest().observer.onOpen?.(true);

describe("useFileEvents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    subs.length = 0;
    vi.useFakeTimers();
    mockAccessToken = "token";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not subscribe when unauthenticated", () => {
    mockAccessToken = null;
    renderHook(() => useFileEvents());
    expect(subscribeEvents).not.toHaveBeenCalled();
  });

  it("subscribes exactly once when authenticated", () => {
    renderHook(() => useFileEvents());
    expect(subscribeEvents).toHaveBeenCalledTimes(1);
  });

  it("subscribes when auth flips from unauthenticated to authenticated", () => {
    mockAccessToken = null;
    const { rerender } = renderHook(() => useFileEvents());
    mockAccessToken = "token";
    rerender();
    expect(subscribeEvents).toHaveBeenCalledTimes(1);
  });

  it("coalesces a burst of file events into a single apply", () => {
    renderHook(() => useFileEvents());
    emit(JSON.stringify({ op: "added", file_id: "f1", rev: 1 }));
    vi.advanceTimersByTime(100);
    emit(JSON.stringify({ op: "renamed", file_id: "f1", rev: 3 }));
    vi.advanceTimersByTime(299);
    expect(applyFileEvents).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(applyFileEvents).toHaveBeenCalledTimes(1);
  });

  it("forwards a malformed payload as null so the batch falls back to a full refresh", () => {
    renderHook(() => useFileEvents());
    expect(() => emit("{not json")).not.toThrow();
    vi.advanceTimersByTime(300);
    expect(applyFileEvents).toHaveBeenCalledWith([null]);
  });

  it("does nothing on the first open", () => {
    renderHook(() => useFileEvents());
    latest().observer.onOpen?.(false);
    expect(invalidateFilesViews).not.toHaveBeenCalled();
    expect(getChanges).not.toHaveBeenCalled();
  });

  it("does a blanket catch-up on reconnect when no rev has been seen yet", () => {
    renderHook(() => useFileEvents());
    reopen();
    expect(invalidateFilesViews).toHaveBeenCalledTimes(1);
    expect(getChanges).not.toHaveBeenCalled();
  });

  it("pulls only the missed changes from the highest rev seen", async () => {
    vi.mocked(getChanges).mockResolvedValue({
      changes: [
        { file_id: "a", rev: 8, deleted: true },
        { file_id: "b", rev: 9, deleted: false },
      ],
      cursor: 9,
    });
    renderHook(() => useFileEvents());
    emit(JSON.stringify({ op: "added", file_id: "x", rev: 7 }));
    emit(JSON.stringify({ op: "added", file_id: "y", rev: 5 }));
    reopen();
    await vi.advanceTimersByTimeAsync(0);
    expect(getChanges).toHaveBeenCalledWith(7);
    expect(applyFileEvents).toHaveBeenCalledWith([
      { op: "deleted", file_id: "a", rev: 8 },
      { op: "updated", file_id: "b", rev: 9 },
    ]);

    vi.mocked(getChanges).mockResolvedValue({ changes: [], cursor: 9 });
    reopen();
    await vi.advanceTimersByTimeAsync(0);
    expect(getChanges).toHaveBeenLastCalledWith(9);
    expect(invalidateFilesViews).not.toHaveBeenCalled();
  });

  it("falls back to a blanket refresh when the changes page is full or the fetch fails", async () => {
    renderHook(() => useFileEvents());
    emit(JSON.stringify({ op: "added", file_id: "x", rev: 1 }));
    vi.mocked(getChanges).mockResolvedValueOnce({
      changes: [1, 2, 3].map((r) => ({ file_id: `f${r}`, rev: r + 1, deleted: false })),
      cursor: 4,
    });
    reopen();
    await vi.advanceTimersByTimeAsync(0);
    expect(invalidateFilesViews).toHaveBeenCalledTimes(1);

    vi.mocked(getChanges).mockRejectedValueOnce(new Error("offline"));
    reopen();
    await vi.advanceTimersByTimeAsync(0);
    expect(invalidateFilesViews).toHaveBeenCalledTimes(2);
  });

  it("drops a catch-up that lands after unmount", async () => {
    let resolve!: (v: { changes: { file_id: string; rev: number; deleted: boolean }[]; cursor: number }) => void;
    vi.mocked(getChanges).mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const { unmount } = renderHook(() => useFileEvents());
    emit(JSON.stringify({ op: "added", file_id: "x", rev: 1 }));
    vi.advanceTimersByTime(300);
    vi.mocked(applyFileEvents).mockClear();
    reopen();
    unmount();
    resolve({ changes: [{ file_id: "z", rev: 2, deleted: true }], cursor: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(applyFileEvents).not.toHaveBeenCalled();
  });

  it("unsubscribes and cancels a pending debounce on unmount", () => {
    const { unmount } = renderHook(() => useFileEvents());
    emit(JSON.stringify({ op: "deleted", file_id: "f1", rev: 4 }));
    unmount();
    expect(latest().unsubscribe).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(300);
    expect(applyFileEvents).not.toHaveBeenCalled();
  });

  it("unmounts cleanly with no pending debounce", () => {
    const { unmount } = renderHook(() => useFileEvents());
    unmount();
    expect(latest().unsubscribe).toHaveBeenCalledTimes(1);
  });
});
