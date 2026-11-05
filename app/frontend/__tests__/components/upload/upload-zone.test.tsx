import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/tauri", () => ({
  isTauri: false,
  pickFiles: vi.fn(),
  toDesktopFile: vi.fn(),
}));

import { UploadZone } from "@/components/upload/upload-zone";

function setup() {
  const onFiles = vi.fn();
  const { container } = render(<UploadZone onFiles={onFiles} />);
  const zone = screen.getByRole("button");
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});
  return { onFiles, zone, input, clickSpy };
}

const busy = (zone: HTMLElement) => zone.getAttribute("aria-busy") === "true";

describe("UploadZone preparing state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("keeps preparing through a long phone-side preparation when the browser reports cancels", () => {
    const { zone } = setup();
    fireEvent.click(zone);
    expect(busy(zone)).toBe(true);
    act(() => {
      window.dispatchEvent(new Event("focus"));
      vi.advanceTimersByTime(90_000);
    });
    expect(busy(zone)).toBe(true);
    act(() => {
      vi.advanceTimersByTime(5 * 60 * 1000);
    });
    expect(busy(zone)).toBe(false);
  });

  it("hands the files over and stops preparing once they arrive", () => {
    const { zone, input, onFiles } = setup();
    fireEvent.click(zone);
    const file = new File(["x"], "a.jpg", { type: "image/jpeg" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    fireEvent.change(input);
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(busy(zone)).toBe(false);
  });

  it("stops preparing when the picker is cancelled", () => {
    const { zone, input } = setup();
    fireEvent.click(zone);
    act(() => {
      input.dispatchEvent(new Event("cancel"));
    });
    expect(busy(zone)).toBe(false);
  });

  it("ignores taps while the picker is open but allows a new pick once it closed", () => {
    const { zone, clickSpy } = setup();
    fireEvent.click(zone);
    fireEvent.click(zone);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    fireEvent.click(zone);
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it("falls back to a short guess on browsers without a cancel event", () => {
    const desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "oncancel");
    // @ts-expect-error simulate an older browser
    delete HTMLElement.prototype.oncancel;
    try {
      const { zone } = setup();
      fireEvent.click(zone);
      act(() => {
        window.dispatchEvent(new Event("focus"));
        vi.advanceTimersByTime(3_000);
      });
      expect(busy(zone)).toBe(false);
    } finally {
      if (desc) Object.defineProperty(HTMLElement.prototype, "oncancel", desc);
    }
  });
});

describe("UploadZone drops", () => {
  afterEach(cleanup);

  it("marks a drop as handled, so a page-wide drop target does not upload it again", () => {
    const onFiles = vi.fn();
    const handled: boolean[] = [];
    render(
      <div onDrop={(e) => handled.push(e.defaultPrevented)}>
        <UploadZone onFiles={onFiles} />
      </div>,
    );
    const file = new File(["x"], "a.bin");
    fireEvent.drop(screen.getByRole("button"), { dataTransfer: { files: [file] } });
    expect(onFiles).toHaveBeenCalledWith([file]);
    expect(handled).toEqual([true]);
  });
});

describe("UploadZone folders", () => {
  afterEach(cleanup);

  function renderWithFolders() {
    const onFiles = vi.fn();
    const onFolder = vi.fn();
    const { container } = render(<UploadZone onFiles={onFiles} onFolder={onFolder} />);
    const folderInput = container.querySelector("input[webkitdirectory]") as HTMLInputElement;
    return { onFiles, onFolder, folderInput };
  }

  it("offers no folder button unless the caller accepts folders", () => {
    const { container } = render(<UploadZone onFiles={vi.fn()} />);
    expect(screen.queryByText("Upload a folder")).toBeNull();
    expect(container.querySelector("input[webkitdirectory]")).toBeNull();
  });

  it("opens the folder picker without opening the file picker, and hands over the folder", () => {
    const { onFiles, onFolder, folderInput } = renderWithFolders();
    const fileInput = document.querySelector('input[type="file"]:not([webkitdirectory])') as HTMLInputElement;
    const fileClick = vi.spyOn(fileInput, "click").mockImplementation(() => {});
    const folderClick = vi.spyOn(folderInput, "click").mockImplementation(() => {});

    fireEvent.click(screen.getByText("Upload a folder"));
    expect(folderClick).toHaveBeenCalledTimes(1);
    expect(fileClick).not.toHaveBeenCalled();

    const file = new File(["x"], "a.jpg");
    Object.defineProperty(file, "webkitRelativePath", { value: "Trip/a.jpg" });
    Object.defineProperty(folderInput, "files", { value: [file], configurable: true });
    fireEvent.change(folderInput);
    expect(onFolder).toHaveBeenCalledWith({ files: [{ file, dir: ["Trip"] }], dirs: [["Trip"]] });
    expect(onFiles).not.toHaveBeenCalled();
  });

  it("ignores an empty folder pick", () => {
    const { onFolder, folderInput } = renderWithFolders();
    Object.defineProperty(folderInput, "files", { value: [], configurable: true });
    fireEvent.change(folderInput);
    expect(onFolder).not.toHaveBeenCalled();
  });

  it("walks a dropped folder and hands it over as a folder upload", async () => {
    const { onFiles, onFolder } = renderWithFolders();
    const file = new File(["x"], "a.jpg");
    const dir = {
      name: "Trip",
      isFile: false,
      isDirectory: true,
      createReader: () => {
        let done = false;
        return {
          readEntries: (ok: (e: unknown[]) => void) => {
            ok(done ? [] : [{ name: "a.jpg", isFile: true, isDirectory: false, file: (cb: (f: File) => void) => cb(file) }]);
            done = true;
          },
        };
      },
    };
    const zone = screen.getAllByRole("button")[0];
    await act(async () => {
      fireEvent.drop(zone, {
        dataTransfer: { files: [], items: [{ kind: "file", webkitGetAsEntry: () => dir }] },
      });
    });
    expect(onFolder).toHaveBeenCalledWith({ files: [{ file, dir: ["Trip"] }], dirs: [["Trip"]] });
    expect(onFiles).not.toHaveBeenCalled();
  });
});

describe("UploadZone folders on iPhone", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("hides the folder button, since iOS has no folder picker", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
    render(<UploadZone onFiles={vi.fn()} onFolder={vi.fn()} />);
    expect(screen.queryByText("Upload a folder")).toBeNull();
  });
});
