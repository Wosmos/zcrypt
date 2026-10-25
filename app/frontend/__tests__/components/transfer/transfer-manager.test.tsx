import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("@/hooks/useFolderProtection", () => ({ resolveFilePasswordGlobal: vi.fn() }));
vi.mock("@/store/toast", () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

import { TransferManager } from "@/components/transfer/transfer-manager";
import { useUploadStore } from "@/store/upload";
import { useDownloadStore, type DownloadItem } from "@/store/download";
import { useConnectivityStore } from "@/store/connectivity";
import { usePassphraseStore } from "@/store/passphrase";
import { useTransferDockStore } from "@/store/transfer-dock";
import { useFolderRegistry } from "@/store/folder-registry";
import { useFolderPasswordStore } from "@/store/folder-passwords";
import { FILES_DRAG_MIME, useDragMove } from "@/hooks/useDragMove";
import { toast } from "@/store/toast";
import type { UploadItem } from "@/types";

const MB = 1024 * 1024;
const initialUpload = useUploadStore.getState();
const initialDownload = useDownloadStore.getState();

function mockMedia({ phone = false, hover = true } = {}) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: query.includes("max-width") ? phone : query.includes("hover") ? hover : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

function up(id: string, patch: Partial<UploadItem> = {}, name = `${id}.jpg`, size = 4.8 * MB): UploadItem {
  const file = new File([], name);
  Object.defineProperty(file, "size", { value: size });
  return { id, file, status: "queued", progress: 0, stage: "Queued", startedAt: 1, ...patch };
}

function down(id: string, patch: Partial<DownloadItem> = {}): DownloadItem {
  return {
    id,
    fileId: `f-${id}`,
    filename: `${id}.pdf`,
    fileSize: 3 * MB,
    status: "downloading",
    progress: 47,
    stage: "Downloading 2/4",
    startedAt: Date.now(),
    ...patch,
  };
}

const actions = {
  pauseUpload: vi.fn(),
  resumeUpload: vi.fn(),
  retryUpload: vi.fn(),
  removeFromQueue: vi.fn(),
  dismissUpload: vi.fn(),
  clearCompleted: vi.fn(),
  getItemFolderId: vi.fn((_id: string): string | null => null),
  getResumableUploadIds: vi.fn((): string[] => []),
};
const dlActions = {
  pauseDownload: vi.fn(),
  resumeDownload: vi.fn(),
  cancelDownload: vi.fn(),
  retryDownload: vi.fn(),
  autoResumeInterrupted: vi.fn(),
  removeFromQueue: vi.fn(),
  clearCompleted: vi.fn(),
};

function seed(uploads: UploadItem[], downloads: DownloadItem[] = []) {
  act(() => {
    useUploadStore.setState({ queue: uploads, ...actions });
    useDownloadStore.setState({ queue: downloads, ...dlActions });
  });
}

beforeEach(() => {
  mockMedia();
  vi.clearAllMocks();
  actions.getItemFolderId.mockImplementation(() => null);
  actions.getResumableUploadIds.mockImplementation(() => []);
  useConnectivityStore.setState({ online: true });
  usePassphraseStore.setState({ getPassphrase: () => "pass" });
  useTransferDockStore.setState({ dropTarget: null, folderNames: {}, visible: false, height: 0 });
  useFolderRegistry.setState({ byId: {} });
  useFolderPasswordStore.getState().clearAll();
  useDragMove.setState({ dragging: null });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  useUploadStore.setState(initialUpload, true);
  useDownloadStore.setState(initialDownload, true);
});

const header = () => screen.getByRole("region", { name: "Transfers" });

describe("TransferManager panel", () => {
  it("renders nothing when idle", () => {
    seed([]);
    const { container } = render(<TransferManager />);
    expect(container).toBeEmptyDOMElement();
  });

  it("header reads n/total, time left, speed and downloads", () => {
    seed(
      [
        up("a", { status: "uploading", stage: "Uploading chunk 1/2", bytesProcessed: 2.8 * MB, totalBytes: 4.8 * MB, rateBps: 2 * MB }),
        up("b", { status: "done", progress: 100, stage: "Done" }),
      ],
      [down("d")],
    );
    render(<TransferManager />);
    expect(header().querySelector("[data-header-count]")).toHaveTextContent("1/3");
    expect(header()).toHaveTextContent("· a few seconds left");
    expect(header().querySelector("[data-header-sub]")).toHaveTextContent("2 MB/s · 1 download");
    expect(screen.getByText("Sending · 2.8 of 4.8 MB")).toBeInTheDocument();
    expect(screen.getByText("Fetching · 1.5 of 3 MB")).toBeInTheDocument();
    expect(screen.getByText(/Saved to My Vault/)).toBeInTheDocument();
  });

  it("falls back to the batch sentence, and says paused or done", () => {
    seed([up("a", { status: "paused", stage: "Paused" })]);
    const { unmount } = render(<TransferManager />);
    expect(header()).toHaveTextContent("0/1 · paused");
    expect(header().querySelector("[data-header-sub]")).toHaveTextContent("Paused. 1 left to go.");
    unmount();
    seed([up("a", { status: "done", progress: 100 })]);
    render(<TransferManager />);
    expect(header()).toHaveTextContent("1/1 · done");
    expect(header().querySelector("[data-header-sub]")).toHaveTextContent("1 saved to My Vault.");
  });

  it("uses the download time estimate when nothing uploads", () => {
    seed([], [down("d", { progress: 50, startedAt: Date.now() - 60_000 })]);
    render(<TransferManager />);
    expect(header()).toHaveTextContent("about 1 min left");
  });

  it("shows the batch block only at 10+ files, with folder name and counts", () => {
    actions.getItemFolderId.mockImplementation(() => "fam");
    useTransferDockStore.getState().rememberFolder("fam", "Family");
    const nine = Array.from({ length: 9 }, (_, i) => up(`q${i}`));
    seed(nine);
    const { unmount } = render(<TransferManager />);
    expect(document.querySelector("[data-batch-block]")).toBeNull();
    unmount();
    seed([
      ...nine,
      up("s", { status: "uploading", stage: "Uploading chunk 1/1" }),
      up("f", { status: "failed", error: "Failed to fetch" }),
      up("d", { status: "done", progress: 100 }),
    ]);
    render(<TransferManager />);
    const block = document.querySelector("[data-batch-block]") as HTMLElement;
    expect(block).toHaveTextContent("12 photos → Family");
    expect(block.querySelector('[data-segment="done"]')).toHaveAttribute("title", "1 done");
    expect(block.querySelector('[data-segment="waiting"]')).toHaveAttribute("title", "9 waiting");
    expect(document.querySelectorAll("[data-transfer-row]")).toHaveLength(3);
    expect(header().querySelector("[data-header-sub]")).toHaveTextContent(
      "Sending 1 photo now, 9 waiting their turn",
    );
  });

  it("names a mixed batch as files", () => {
    seed(Array.from({ length: 10 }, (_, i) => up(`q${i}`, {}, `doc${i}.pdf`)));
    render(<TransferManager />);
    expect(document.querySelector("[data-batch-block]")).toHaveTextContent("10 files → My Vault");
  });

  it("puts failed rows first with a visible retry and a cause", () => {
    seed([
      up("ok", { status: "uploading", stage: "Uploading chunk 1/1", bytesProcessed: 1, totalBytes: 2, startedAt: 9 }),
      up("bad", { status: "failed", error: "Can't reach zcrypt's servers (network/DNS)", bytesProcessed: 1, totalBytes: 2 }),
    ]);
    render(<TransferManager />);
    const rows = document.querySelectorAll("[data-transfer-row]");
    expect(rows[0]).toHaveAttribute("data-state", "failed");
    expect(within(rows[0] as HTMLElement).getByText(/the connection dropped at 59%/)).toBeInTheDocument();
    fireEvent.click(within(rows[0] as HTMLElement).getByRole("button", { name: "Retry" }));
    expect(actions.retryUpload).toHaveBeenCalledWith("bad", "pass");
  });

  it("footer: retry failed only with failures, pause all, resume all, clear done", () => {
    seed(
      [
        up("a", { status: "uploading", stage: "Uploading chunk 1/1" }),
        up("b", { status: "failed", error: "x" }),
        up("c", { status: "done", progress: 100 }),
      ],
      [down("d", { status: "failed", error: "Download failed" })],
    );
    const { unmount } = render(<TransferManager />);
    fireEvent.click(screen.getByRole("button", { name: "Retry failed" }));
    expect(actions.retryUpload).toHaveBeenCalledWith("b", "pass");
    expect(dlActions.retryDownload).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pause all" }));
    expect(actions.pauseUpload).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: "Clear done" }));
    expect(actions.clearCompleted).toHaveBeenCalled();
    expect(dlActions.clearCompleted).toHaveBeenCalled();
    unmount();

    seed([up("a", { status: "paused" })], [down("d", { status: "paused" })]);
    render(<TransferManager />);
    expect(screen.queryByRole("button", { name: "Retry failed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Clear done" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume all" }));
    expect(actions.resumeUpload).toHaveBeenCalledWith("a", "pass");
    expect(dlActions.resumeDownload).toHaveBeenCalledWith("d", "pass", expect.anything());
  });

  it("pause all skips desktop uploads, and an all-desktop job offers no pause", () => {
    seed([up("a", { status: "uploading", desktop: true })]);
    render(<TransferManager />);
    expect(screen.queryByRole("button", { name: "Pause all" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Pause upload" })).toBeNull();
  });

  it("row controls: hover-revealed on desktop, always visible on touch", () => {
    seed([up("a", { status: "uploading" })]);
    const { unmount } = render(<TransferManager />);
    expect(document.querySelector("[data-row-controls]")).toHaveAttribute("data-hover-only", "true");
    expect(document.querySelector("[data-row-controls]")).toHaveClass("opacity-0");
    unmount();
    mockMedia({ hover: false });
    render(<TransferManager />);
    expect(document.querySelector("[data-row-controls]")).toHaveAttribute("data-hover-only", "false");
    expect(document.querySelector("[data-row-controls]")).not.toHaveClass("opacity-0");
  });

  it("row controls call the right store actions", () => {
    seed(
      [up("a", { status: "uploading" }), up("p", { status: "paused" }), up("q")],
      [down("d"), down("e", { status: "paused" }), down("z", { status: "queued", stage: "Queued" })],
    );
    render(<TransferManager />);
    fireEvent.click(screen.getByRole("button", { name: "Pause upload" }));
    expect(actions.pauseUpload).toHaveBeenCalledWith("a");
    fireEvent.click(screen.getByRole("button", { name: "Resume upload" }));
    expect(actions.resumeUpload).toHaveBeenCalledWith("p", "pass");
    fireEvent.click(screen.getAllByRole("button", { name: "Cancel upload" })[0]);
    expect(actions.removeFromQueue).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Pause download" }));
    expect(dlActions.pauseDownload).toHaveBeenCalledWith("d");
    fireEvent.click(screen.getByRole("button", { name: "Resume download" }));
    expect(dlActions.resumeDownload).toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole("button", { name: "Stop download" })[0]);
    expect(dlActions.cancelDownload).toHaveBeenCalled();
  });

  it("dismiss is non-destructive for uploads and removes downloads", () => {
    seed([up("a", { status: "failed", error: "x" })], [down("d", { status: "cancelled" })]);
    render(<TransferManager />);
    const dismiss = screen.getAllByRole("button", { name: "Dismiss" });
    fireEvent.click(dismiss[0]);
    fireEvent.click(dismiss[1]);
    expect(actions.dismissUpload).toHaveBeenCalledWith("a");
    expect(dlActions.removeFromQueue).toHaveBeenCalledWith("d");
  });

  it("a failed desktop upload resumes instead of retrying", () => {
    seed([up("a", { status: "failed", error: "x", desktop: true })]);
    render(<TransferManager />);
    fireEvent.click(screen.getByRole("button", { name: "Resume upload" }));
    expect(actions.retryUpload).toHaveBeenCalledWith("a", "pass");
  });

  it("protected folders: uses the cached folder password or asks to open the folder", () => {
    actions.getItemFolderId.mockImplementation(() => "locked");
    useFolderRegistry.getState().record([{ id: "locked", pw_salt: "s", pw_verifier: "v" } as never]);
    seed([up("a", { status: "failed", error: "x" })]);
    render(<TransferManager />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(toast.info).toHaveBeenCalledWith(
      "Open the protected folder to unlock it, then retry this transfer.",
    );
    act(() => useFolderPasswordStore.getState().set("locked", "folderpw"));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(actions.retryUpload).toHaveBeenCalledWith("a", "folderpw");
  });

  it("without a cached passphrase it asks to unlock and resumes after", () => {
    let pass: string | null = null;
    usePassphraseStore.setState({ getPassphrase: () => pass });
    const onNeedUnlock = vi.fn((resume: () => void) => {
      pass = "late";
      resume();
    });
    seed([up("a", { status: "failed", error: "x" })]);
    render(<TransferManager onNeedUnlock={onNeedUnlock} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(actions.retryUpload).toHaveBeenCalledWith("a", "late");
  });

  it("folds done rows after 5 seconds but keeps them counted", () => {
    vi.useFakeTimers();
    seed([up("a", { status: "done", progress: 100 }), up("b", { status: "uploading" })]);
    render(<TransferManager />);
    expect(document.querySelectorAll("[data-transfer-row]")).toHaveLength(2);
    act(() => vi.advanceTimersByTime(5000));
    expect(document.querySelectorAll("[data-transfer-row]")).toHaveLength(1);
    expect(header().querySelector("[data-header-count]")).toHaveTextContent("1/2");
  });

  it("the bar never moves backwards for an item", () => {
    seed([up("a", { status: "uploading", stage: "Uploading chunk 1/1", bytesProcessed: 4, totalBytes: 5 })]);
    render(<TransferManager />);
    const width = () => (document.querySelector("[data-bar]") as HTMLElement).style.width;
    const before = width();
    seed([up("a", { status: "encrypting", stage: "Hashing file…" })]);
    expect(width()).toBe(before);
  });

  it("says waiting for Wi-Fi when offline", () => {
    useConnectivityStore.setState({ online: false });
    seed([up("a", { status: "uploading" })]);
    render(<TransferManager />);
    expect(screen.getByText("Waiting for Wi-Fi")).toBeInTheDocument();
  });

  it("Esc minimizes to the slim bar, the bar opens it again", () => {
    seed([up("a", { status: "uploading" }), up("f", { status: "failed", error: "x" })]);
    render(<TransferManager />);
    fireEvent.keyDown(screen.getByRole("button", { name: "Minimize transfers" }), { key: "Escape" });
    const open = screen.getByRole("button", { name: "Open transfers" });
    expect(open).toHaveTextContent("0/2");
    expect(open).toHaveTextContent("1");
    fireEvent.click(open);
    expect(screen.getByRole("button", { name: "Minimize transfers" })).toBeInTheDocument();
    fireEvent.keyDown(header(), { key: "Enter" });
    expect(screen.getByRole("button", { name: "Minimize transfers" })).toBeInTheDocument();
  });

  it("close minimizes while work remains and clears when settled", () => {
    seed([up("a", { status: "uploading" })]);
    const { unmount } = render(<TransferManager />);
    fireEvent.click(screen.getByRole("button", { name: "Close transfers" }));
    expect(screen.getByRole("button", { name: "Open transfers" })).toBeInTheDocument();
    unmount();
    seed([up("a", { status: "done", progress: 100 })]);
    const { container } = render(<TransferManager />);
    fireEvent.click(screen.getByRole("button", { name: "Close transfers" }));
    expect(actions.clearCompleted).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it("reports its footprint for the mobile FAB", () => {
    seed([up("a", { status: "uploading" })]);
    const { unmount } = render(<TransferManager />);
    expect(useTransferDockStore.getState().visible).toBe(true);
    unmount();
  });

  it("warns before closing the tab while transfers move", () => {
    seed([up("a", { status: "uploading" })]);
    render(<TransferManager />);
    const e = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
  });

  it("auto-resumes interrupted uploads and downloads on visibility and online", () => {
    actions.getResumableUploadIds.mockImplementation(() => ["a", "b"]);
    actions.getItemFolderId.mockImplementation((id: string) => (id === "b" ? "locked" : null));
    useFolderRegistry.getState().record([{ id: "locked", pw_salt: "s", pw_verifier: "v" } as never]);
    seed([up("a", { status: "failed", error: "x" })]);
    render(<TransferManager />);
    act(() => {
      window.dispatchEvent(new Event("online"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(actions.resumeUpload).toHaveBeenCalledWith("a", "pass");
    expect(actions.resumeUpload).not.toHaveBeenCalledWith("b", expect.anything());
    expect(dlActions.autoResumeInterrupted).toHaveBeenCalled();
  });
});

describe("TransferManager phone orb", () => {
  beforeEach(() => mockMedia({ phone: true, hover: false }));

  it("starts as an orb with a left badge and a failed badge, and opens on tap", () => {
    seed([up("a", { status: "uploading", fileId: "f1" }), up("q"), up("x", { status: "failed", error: "x" })]);
    render(<TransferManager />);
    const orb = screen.getByRole("button", { name: /Transfers, 2 left/ });
    expect(orb).toHaveAttribute("data-orb", "active");
    expect(orb.querySelector('[data-orb-badge="left"]')).toHaveTextContent("2");
    expect(orb.querySelector('[data-orb-badge="failed"]')).toHaveTextContent("1");
    expect(orb.querySelectorAll("[data-arc]")).toHaveLength(4);
    fireEvent.click(orb);
    expect(screen.getByRole("button", { name: "Minimize transfers" })).toBeInTheDocument();
  });

  it("shows a lock when nothing has a thumbnail to show", () => {
    seed([up("q")], [down("d", { status: "queued" })]);
    render(<TransferManager />);
    expect(document.querySelector('[data-orb-centre="lock"]')).not.toBeNull();
  });

  it("long-press pauses all, and on a paused set resumes all", () => {
    vi.useFakeTimers();
    seed([up("a", { status: "uploading" })]);
    const { unmount } = render(<TransferManager />);
    const orb = screen.getByRole("button", { name: /Transfers/ });
    fireEvent.pointerDown(orb);
    act(() => vi.advanceTimersByTime(500));
    fireEvent.pointerUp(orb);
    fireEvent.click(orb);
    expect(actions.pauseUpload).toHaveBeenCalledWith("a");
    expect(screen.queryByRole("button", { name: "Minimize transfers" })).toBeNull();
    fireEvent.pointerDown(orb);
    fireEvent.pointerLeave(orb);
    act(() => vi.advanceTimersByTime(600));
    expect(actions.pauseUpload).toHaveBeenCalledTimes(1);
    unmount();

    seed([up("a", { status: "paused" })]);
    render(<TransferManager />);
    const paused = screen.getByRole("button", { name: /Transfers/ });
    expect(paused).toHaveAttribute("data-orb", "paused");
    fireEvent.pointerDown(paused);
    act(() => vi.advanceTimersByTime(500));
    expect(actions.resumeUpload).toHaveBeenCalledWith("a", "pass");
  });

  it("turns green when done and fades after 4 seconds", () => {
    vi.useFakeTimers();
    seed([up("a", { status: "done", progress: 100 })]);
    const { container } = render(<TransferManager />);
    expect(screen.getByRole("button", { name: /Transfers/ })).toHaveAttribute("data-orb", "done");
    act(() => vi.advanceTimersByTime(4000));
    expect(container).toBeEmptyDOMElement();
  });
});

function dt(types: string[], extra: Partial<DataTransfer> = {}): DataTransfer {
  return {
    types,
    items: [],
    files: [],
    dropEffect: "none",
    getData: () => "",
    ...extra,
  } as unknown as DataTransfer;
}

describe("TransferManager drag and drop", () => {
  const target = { folderName: "Family", upload: vi.fn(), download: vi.fn() };
  beforeEach(() => {
    useTransferDockStore.setState({ dropTarget: target });
  });

  it("OS files dropped on the open panel upload into the current folder", () => {
    seed([up("a", { status: "uploading" })]);
    render(<TransferManager />);
    const file = new File(["x"], "new.jpg");
    const data = dt(["Files"], { items: [{ kind: "file" }, { kind: "file" }] as never, files: [file] as never });
    fireEvent.dragEnter(window, { dataTransfer: data });
    fireEvent.dragEnter(header(), { dataTransfer: data });
    fireEvent.dragOver(header(), { dataTransfer: data });
    const overlay = document.querySelector('[data-drop-overlay="upload"]');
    expect(overlay).toHaveTextContent("Drop to upload");
    expect(overlay).toHaveTextContent("2 files → Family · encrypted here first");
    fireEvent.drop(header(), { dataTransfer: data });
    expect(target.upload).toHaveBeenCalledWith([file]);
    expect(document.querySelector("[data-drop-overlay]")).toBeNull();
  });

  it("vault files dropped on the panel download", () => {
    useDragMove.setState({ dragging: { kind: "file", id: "1", name: "a", ids: ["1", "2"] } });
    seed([up("a", { status: "uploading" })]);
    render(<TransferManager />);
    const data = dt([FILES_DRAG_MIME], { getData: () => JSON.stringify(["1", "2", 3, ""]) });
    fireEvent.dragEnter(window, { dataTransfer: data });
    fireEvent.dragEnter(header(), { dataTransfer: data });
    expect(document.querySelector('[data-drop-overlay="download"]')).toHaveTextContent(
      "2 files · decrypted on this device",
    );
    fireEvent.dragLeave(header(), { dataTransfer: data, relatedTarget: document.body });
    expect(document.querySelector("[data-drop-overlay]")).toBeNull();
    fireEvent.drop(header(), { dataTransfer: data });
    expect(target.download).toHaveBeenCalledWith(["1", "2"]);
  });

  it("ignores drops with nothing usable and drags it does not understand", () => {
    seed([up("a", { status: "uploading" })]);
    render(<TransferManager />);
    fireEvent.dragEnter(window, { dataTransfer: dt(["text/plain"]) });
    fireEvent.dragEnter(header(), { dataTransfer: dt(["text/plain"]) });
    fireEvent.dragOver(header(), { dataTransfer: dt(["text/plain"]) });
    fireEvent.drop(header(), { dataTransfer: dt(["text/plain"]) });
    fireEvent.dragLeave(window, { dataTransfer: dt(["text/plain"]) });
    fireEvent.drop(header(), { dataTransfer: dt(["Files"]) });
    fireEvent.drop(header(), { dataTransfer: dt([FILES_DRAG_MIME], { getData: () => "not json" }) });
    fireEvent.drop(header(), { dataTransfer: dt([FILES_DRAG_MIME], { getData: () => '{"a":1}' }) });
    expect(target.upload).not.toHaveBeenCalled();
    expect(target.download).not.toHaveBeenCalled();
  });

  it("OS files are not accepted where no page takes uploads", () => {
    useTransferDockStore.setState({ dropTarget: null });
    seed([up("a", { status: "uploading" })]);
    render(<TransferManager />);
    fireEvent.dragEnter(window, { dataTransfer: dt(["Files"]) });
    fireEvent.dragEnter(header(), { dataTransfer: dt(["Files"]) });
    expect(document.querySelector("[data-drop-overlay]")).toBeNull();
    useTransferDockStore.setState({ dropTarget: null });
    fireEvent.drop(header(), { dataTransfer: dt([FILES_DRAG_MIME], { getData: () => '["1"]' }) });
    expect(target.download).not.toHaveBeenCalled();
  });

  it("the slim bar swells into a drop zone while a drag is anywhere in the window", () => {
    seed([up("a", { status: "uploading" })]);
    render(<TransferManager />);
    fireEvent.click(screen.getByRole("button", { name: "Minimize transfers" }));
    const data = dt(["Files"], { items: [{ kind: "file" }, { kind: "string" }] as never });
    fireEvent.dragEnter(window, { dataTransfer: data });
    fireEvent.dragEnter(window, { dataTransfer: data });
    expect(document.querySelector('[data-slim-drop="upload"]')).toHaveTextContent(
      "Drop to upload 1 file → Family",
    );
    fireEvent.dragLeave(window, { dataTransfer: data });
    expect(document.querySelector("[data-slim-drop]")).not.toBeNull();
    fireEvent.dragLeave(window, { dataTransfer: data });
    expect(document.querySelector("[data-slim-drop]")).toBeNull();
    useDragMove.setState({ dragging: null });
    fireEvent.dragEnter(window, { dataTransfer: dt([FILES_DRAG_MIME]) });
    expect(document.querySelector('[data-slim-drop="download"]')).toHaveTextContent("Drop to download 1 file");
    fireEvent(window, new Event("dragend"));
    expect(document.querySelector("[data-slim-drop]")).toBeNull();
  });

  it("the orb becomes a drop zone too", () => {
    mockMedia({ phone: true });
    seed([up("a", { status: "uploading" })]);
    render(<TransferManager />);
    fireEvent.dragEnter(window, { dataTransfer: dt([FILES_DRAG_MIME]) });
    expect(screen.getByRole("button", { name: /Transfers/ })).toHaveAttribute("data-orb", "drop");
    fireEvent.dragEnter(window, { dataTransfer: dt(["Files"]) });
    fireEvent(window, new Event("drop"));
    expect(screen.getByRole("button", { name: /Transfers/ })).toHaveAttribute("data-orb", "active");
  });
});
