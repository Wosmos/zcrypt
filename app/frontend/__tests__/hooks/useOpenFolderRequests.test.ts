import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { act, renderHook } from "@testing-library/react";

const h = vi.hoisted(() => ({ folders: [] as Array<{ id: string; name: string }> }));
vi.mock("@/hooks/useFolders", () => ({ useFolders: () => ({ folders: h.folders }) }));

import { useOpenFolderRequests } from "@/hooks/useOpenFolderRequests";
import { OPEN_FOLDER_EVENT } from "@/lib/service-worker";
import { useFolderStore } from "@/store/folders";
import { useTransferDockStore } from "@/store/transfer-dock";

function request(folderId: string | null) {
  act(() => {
    window.dispatchEvent(new CustomEvent(OPEN_FOLDER_EVENT, { detail: { folderId } }));
  });
}

beforeEach(() => {
  h.folders = [];
  useTransferDockStore.setState({ folderNames: {} });
  window.history.replaceState(null, "", "/dashboard");
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("useOpenFolderRequests", () => {
  it("opens the folder from ?open= once its name is known and drops the parameter", () => {
    window.history.replaceState(null, "", "/dashboard?open=f1&view=grid#top");
    const open = vi.fn();
    const { rerender } = renderHook(() => useOpenFolderRequests(open));
    expect(open).not.toHaveBeenCalled();

    h.folders = [{ id: "f1", name: "Family" }];
    rerender();
    expect(open).toHaveBeenCalledWith("f1", "Family");
    expect(window.location.search).toBe("?view=grid");
    expect(window.location.hash).toBe("#top");

    rerender();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("opens a folder a notification tap asked for, using the remembered upload destination", () => {
    useTransferDockStore.getState().rememberFolder("deep", "Trips");
    const open = vi.fn();
    renderHook(() => useOpenFolderRequests(open));
    request("deep");
    expect(open).toHaveBeenCalledWith("deep", "Trips");
    expect(window.location.pathname).toBe("/dashboard");
  });

  it("goes to the vault root when the tap has no folder", () => {
    useFolderStore.getState().setCurrentFolder("x", "X");
    const open = vi.fn();
    const { unmount } = renderHook(() => useOpenFolderRequests(open));
    act(() => {
      window.dispatchEvent(new CustomEvent(OPEN_FOLDER_EVENT));
    });
    expect(useFolderStore.getState().currentFolderId).toBeNull();
    request(null);
    expect(open).not.toHaveBeenCalled();
    unmount();
  });

  it("renders on the server without reading the address", () => {
    function Probe() {
      useOpenFolderRequests(() => {});
      return null;
    }
    vi.stubGlobal("window", undefined);
    expect(renderToString(createElement(Probe))).toBe("");
    vi.unstubAllGlobals();
  });
});
