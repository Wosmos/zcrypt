import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const tauri = vi.hoisted(() => ({ isTauri: false }));
vi.mock("@/lib/tauri", () => ({
  get isTauri() {
    return tauri.isTauri;
  },
}));
const warning = vi.hoisted(() => vi.fn());
vi.mock("@/store/toast", () => ({ toast: { warning } }));

import { useInterruptedDownloads } from "@/hooks/useInterruptedDownloads";
import { takeInterrupted } from "@/lib/interrupted-downloads";
import { useDownloadStore } from "@/store/download";
import { DownloadStatus } from "@/types";

const item = (id: string, filename: string, status: DownloadStatus) => ({
  id,
  fileId: id,
  filename,
  fileSize: 1,
  status,
  progress: 0,
  stage: "",
  startedAt: 0,
});

function unloadPage() {
  window.dispatchEvent(new Event("pagehide"));
}

describe("interrupted downloads", () => {
  beforeEach(() => {
    tauri.isTauri = false;
    sessionStorage.clear();
    warning.mockClear();
    useDownloadStore.setState({ queue: [] });
  });
  afterEach(() => sessionStorage.clear());

  it("says so after a reload that cut a running download, once", () => {
    useDownloadStore.setState({
      queue: [
        item("a", "movie.mkv", DownloadStatus.Downloading),
        item("b", "done.txt", DownloadStatus.Done),
        item("c", "paused.zip", DownloadStatus.Paused),
        item("d", "failed.bin", DownloadStatus.Failed),
      ],
    });
    const first = renderHook(() => useInterruptedDownloads());
    unloadPage();
    first.unmount();

    renderHook(() => useInterruptedDownloads());
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning.mock.calls[0][0]).toContain("movie.mkv, paused.zip");
    expect(warning.mock.calls[0][0]).not.toContain("done.txt");
    expect(warning.mock.calls[0][0]).not.toContain("failed.bin");
    expect(takeInterrupted()).toEqual([]);
  });

  it("stays quiet when nothing was running at unload", () => {
    useDownloadStore.setState({ queue: [item("b", "done.txt", DownloadStatus.Done)] });
    const first = renderHook(() => useInterruptedDownloads());
    unloadPage();
    first.unmount();
    renderHook(() => useInterruptedDownloads());
    expect(warning).not.toHaveBeenCalled();
  });

  it("clears the note when the browser restores the page from its cache", () => {
    useDownloadStore.setState({ queue: [item("a", "movie.mkv", DownloadStatus.Downloading)] });
    const first = renderHook(() => useInterruptedDownloads());
    unloadPage();
    const restored = new Event("pageshow") as PageTransitionEvent;
    Object.defineProperty(restored, "persisted", { value: true });
    window.dispatchEvent(restored);
    first.unmount();
    renderHook(() => useInterruptedDownloads());
    expect(warning).not.toHaveBeenCalled();
  });

  it("names the first three and counts the rest", () => {
    useDownloadStore.setState({
      queue: ["1", "2", "3", "4", "5"].map((n) => item(n, `f${n}.bin`, DownloadStatus.Downloading)),
    });
    const first = renderHook(() => useInterruptedDownloads());
    unloadPage();
    first.unmount();
    renderHook(() => useInterruptedDownloads());
    expect(warning.mock.calls[0][0]).toContain("f1.bin, f2.bin, f3.bin and 2 more");
  });

  it("does nothing in the desktop app, where downloads outlive a reload", () => {
    tauri.isTauri = true;
    sessionStorage.setItem("zc_dl_interrupted", JSON.stringify(["movie.mkv"]));
    useDownloadStore.setState({ queue: [item("a", "movie.mkv", DownloadStatus.Downloading)] });

    const hook = renderHook(() => useInterruptedDownloads());
    hook.unmount();

    expect(warning).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("zc_dl_interrupted")).toBe(JSON.stringify(["movie.mkv"]));
  });
});
