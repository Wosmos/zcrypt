import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Key } from "@/lib/icons";

afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof ConfirmModal>> = {}) {
  const onConfirm = vi.fn();
  const onClose = vi.fn();
  render(
    <ConfirmModal
      open
      title="Delete 12 files?"
      description="They move to Trash."
      confirmLabel="Delete 12 files"
      onConfirm={onConfirm}
      onClose={onClose}
      {...props}
    />,
  );
  return { onConfirm, onClose };
}

describe("ConfirmModal", () => {
  it("shows a question title, a paragraph and a destructive button named with the count", () => {
    const { onConfirm } = setup();
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Delete 12 files?")).toBeInTheDocument();
    expect(within(dialog).getByText("They move to Trash.")).toBeInTheDocument();
    const destructive = within(dialog).getByRole("button", { name: "Delete 12 files" });
    expect(destructive.className).toContain("bg-red-600");
    fireEvent.click(destructive);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("never falls back to OK and focuses the safe button", () => {
    setup({ confirmLabel: undefined });
    expect(screen.queryByRole("button", { name: "OK" })).toBeNull();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
  });

  it("closes from the safe button and respects a custom cancel label", () => {
    const { onClose } = setup({ cancelLabel: "Keep them" });
    fireEvent.click(screen.getByRole("button", { name: "Keep them" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes with Escape and the close button", () => {
    const { onClose } = setup();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("lays out as a bottom sheet on phones: handle, stacked buttons, destructive first", () => {
    setup();
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.className).toContain("bottom-0");
    expect(dialog.className).toContain("md:top-1/2");
    expect(dialog.querySelector("[data-sheet-handle]")?.className).toContain("md:hidden");
    const buttons = within(dialog).getAllByRole("button").filter((b) => b.textContent !== "");
    const names = buttons.map((b) => b.textContent);
    expect(names.indexOf("Delete 12 files")).toBeLessThan(names.indexOf("Cancel"));
    const row = buttons[0].parentElement as HTMLElement;
    expect(row.className).toContain("flex-col");
    expect(row.className).toContain("md:flex-row-reverse");
  });

  it("uses the warning and info looks and a custom icon", () => {
    const { rerender } = render(
      <ConfirmModal open title="t" description="d" variant="warning" icon={Key} onConfirm={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Confirm" }).className).toContain("bg-amber-500");
    rerender(<ConfirmModal open title="t" description="d" variant="info" onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Confirm" }).className).toContain("var(--color-accent)");
  });

  it("shows details and extra children", () => {
    setup({ details: "id-123", children: <p>extra content</p> });
    expect(screen.getByText("id-123")).toBeInTheDocument();
    expect(screen.getByText("extra content")).toBeInTheDocument();
  });

  describe("preview row", () => {
    it("spells out two names, the rest as a count, and the size", () => {
      setup({
        preview: {
          names: ["Beach day.jpg", "IMG_4021.HEIC", "c", "d"],
          count: 12,
          bytes: 48 * 1024 * 1024,
          thumbnails: ["blob:a", "blob:b", "blob:c", "blob:d", "blob:e"],
        },
      });
      const row = document.querySelector("[data-confirm-preview]") as HTMLElement;
      expect(row).toHaveTextContent("Beach day.jpg, IMG_4021.HEIC and 10 more");
      expect(row).toHaveTextContent("48");
      expect(row.querySelectorAll("img")).toHaveLength(4);
    });

    it("joins two names with and when nothing is left over, without size or thumbnails", () => {
      setup({ preview: { names: ["a.txt", "b.txt"] } });
      const row = document.querySelector("[data-confirm-preview]") as HTMLElement;
      expect(row).toHaveTextContent("a.txt and b.txt");
      expect(row.querySelector("img")).toBeNull();
    });

    it("handles a single name", () => {
      setup({ preview: { names: ["only.txt"], bytes: 0 } });
      expect(document.querySelector("[data-confirm-preview]")).toHaveTextContent("only.txt");
    });
  });

  describe("typeToConfirm", () => {
    it("keeps the destructive button off until the word is typed", () => {
      const { onConfirm } = setup({ typeToConfirm: "DELETE" });
      const destructive = screen.getByRole("button", { name: "Delete 12 files" });
      expect(destructive).toBeDisabled();
      const input = screen.getByRole("textbox");
      expect(screen.getByText("DELETE", { selector: "b" })).toBeInTheDocument();
      fireEvent.change(input, { target: { value: "delet" } });
      expect(destructive).toBeDisabled();
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onConfirm).not.toHaveBeenCalled();
      fireEvent.change(input, { target: { value: " delete " } });
      expect(destructive).toBeEnabled();
      fireEvent.keyDown(input, { key: "a" });
      expect(onConfirm).not.toHaveBeenCalled();
      fireEvent.keyDown(input, { key: "Enter" });
      expect(onConfirm).toHaveBeenCalledOnce();
    });

    it("clears what was typed when the dialog closes", () => {
      const props = { title: "t", description: "d", typeToConfirm: "Trips", onConfirm: vi.fn(), onClose: vi.fn() };
      const { rerender } = render(<ConfirmModal open {...props} />);
      fireEvent.change(screen.getByRole("textbox"), { target: { value: "Trips" } });
      rerender(<ConfirmModal open={false} {...props} />);
      rerender(<ConfirmModal open {...props} />);
      expect(screen.getByRole("textbox")).toHaveValue("");
    });
  });

  describe("loading and disabled", () => {
    it("shows progress, blocks both buttons and ignores close", () => {
      const { onConfirm, onClose } = setup({ loading: true });
      expect(screen.getByRole("button", { name: /Processing/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
      fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
      expect(onClose).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("blocks confirm when confirmDisabled", () => {
      const { onConfirm } = setup({ confirmDisabled: true });
      fireEvent.click(screen.getByRole("button", { name: "Delete 12 files" }));
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  it("renders nothing while closed", () => {
    setup({ open: false });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("ConfirmDialog", () => {
  it("maps destructive to the red look and onOpenChange(false) to closing", () => {
    const onOpenChange = vi.fn();
    render(
      <ConfirmDialog open destructive onOpenChange={onOpenChange} title="t" description="d" confirmLabel="Remove" onConfirm={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: "Remove" }).className).toContain("bg-red-600");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("is a calm accent dialog unless destructive, and accepts an explicit variant", () => {
    const base = { open: true, onOpenChange: vi.fn(), title: "t", description: "d", onConfirm: vi.fn() };
    const { rerender } = render(<ConfirmDialog {...base} />);
    expect(screen.getByRole("button", { name: "Confirm" }).className).toContain("var(--color-accent)");
    rerender(<ConfirmDialog {...base} variant="warning" />);
    expect(screen.getByRole("button", { name: "Confirm" }).className).toContain("bg-amber-500");
  });
});
