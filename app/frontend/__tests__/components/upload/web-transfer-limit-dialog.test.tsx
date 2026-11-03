import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({
  lead: "open" as "open" | "download",
  tryOpen: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@/lib/open-desktop-app", () => ({
  desktopAppLead: () => h.lead,
  tryOpenDesktopApp: h.tryOpen,
  openDesktopDownload: h.download,
}));

import { WebTransferLimitDialog } from "@/components/upload/web-transfer-limit-dialog";
import { useWebTransferNotice } from "@/store/web-transfer-notice";
import { WebTransferLimitCode } from "@/lib/web-transfer-limit";

const MB = 1024 * 1024;
const tooBig = { code: WebTransferLimitCode.FileTooLarge, limitBytes: MB };

function show(...args: Parameters<ReturnType<typeof useWebTransferNotice.getState>["show"]>) {
  act(() => useWebTransferNotice.getState().show(...args));
}

beforeEach(() => {
  h.lead = "open";
  h.tryOpen.mockReset();
  h.download.mockReset();
});

afterEach(() => {
  act(() => useWebTransferNotice.getState().close());
  cleanup();
});

describe("WebTransferLimitDialog", () => {
  it("renders nothing until a refusal opens it", () => {
    render(<WebTransferLimitDialog />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("explains one file too big for the browser and leads with opening the app", async () => {
    h.tryOpen.mockResolvedValue(true);
    render(<WebTransferLimitDialog />);
    show(tooBig, { name: "big-2.5mb.bin", size: 2.5 * MB });
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Too big for the browser");
    expect(dialog).toHaveTextContent(
      "big-2.5mb.bin is 2.5 MB. Browser uploads are capped at 1 MB because they pass through our servers. The desktop app sends files straight to your storage, with no size limit.",
    );
    expect(dialog).toHaveTextContent("Open the app, then drop the file there.");
    expect(dialog).not.toHaveTextContent(/relay/i);
    expect(screen.getByRole("button", { name: "Get the desktop app" })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Open the desktop app" }));
    });
    expect(h.tryOpen).toHaveBeenCalledTimes(1);
    expect(useWebTransferNotice.getState().notice).toBeNull();
  });

  it("switches in place to the download when nothing opened", async () => {
    let settle!: (opened: boolean) => void;
    h.tryOpen.mockReturnValue(new Promise<boolean>((r) => (settle = r)));
    render(<WebTransferLimitDialog />);
    show(tooBig, { name: "a.bin", size: 2 * MB });
    fireEvent.click(screen.getByRole("button", { name: "Open the desktop app" }));
    expect(screen.getByRole("button", { name: "Opening the app…" })).toBeDisabled();
    await act(async () => settle(false));
    expect(screen.getByRole("status")).toHaveTextContent("Nothing opened");
    expect(screen.queryByRole("button", { name: "Get the desktop app" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Don't see it? Get the desktop app" }));
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(useWebTransferNotice.getState().notice).toBeNull();
  });

  it("offers the download as the second choice when leading with open", () => {
    render(<WebTransferLimitDialog />);
    show(tooBig, { name: "a.bin", size: 2 * MB });
    fireEvent.click(screen.getByRole("button", { name: "Get the desktop app" }));
    expect(h.download).toHaveBeenCalledTimes(1);
    expect(h.tryOpen).not.toHaveBeenCalled();
  });

  it("leads with the download where there is no app to open, and Not now just closes", () => {
    h.lead = "download";
    render(<WebTransferLimitDialog />);
    show(tooBig, { name: "a.bin", size: 2 * MB });
    expect(screen.queryByRole("button", { name: "Open the desktop app" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "Get the desktop app" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Not now" }));
    expect(useWebTransferNotice.getState().notice).toBeNull();
    expect(h.download).not.toHaveBeenCalled();
  });

  it("collects a batch into one dialog that names a few files", () => {
    render(<WebTransferLimitDialog />);
    for (const name of ["a.bin", "b.bin", "c.bin", "d.bin"]) show(tooBig, { name, size: 2 * MB }, "batch-x");
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("4 files are too big for the browser");
    expect(dialog).toHaveTextContent("a.bin");
    expect(dialog).toHaveTextContent("c.bin");
    expect(dialog).not.toHaveTextContent("d.bin");
    expect(dialog).toHaveTextContent("and 1 more");
    expect(dialog).toHaveTextContent("Open the app, then drop the files there.");
  });

  it("explains the month's allowance with what is used and when it resets", () => {
    render(<WebTransferLimitDialog />);
    show(
      {
        code: WebTransferLimitCode.AllowanceExceeded,
        limitBytes: 3_000_000,
        usedBytes: 3_100_000,
        resetsAt: "2026-12-01T00:00:00Z",
      },
      { name: "a.bin", size: 10 },
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("You've used this month's web transfers");
    expect(dialog).toHaveTextContent("2.9 MB of 2.9 MB. It resets on December 1. The desktop app has no limit.");
  });

  it("closes on Escape", () => {
    render(<WebTransferLimitDialog />);
    show(tooBig);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(useWebTransferNotice.getState().notice).toBeNull();
  });
});
