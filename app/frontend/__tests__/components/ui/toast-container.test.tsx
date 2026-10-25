import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/sounds", () => ({ playSound: vi.fn(), installAudioUnlock: vi.fn(() => vi.fn()) }));

import { ToastContainer } from "@/components/ui/toast-container";
import { toast, useToastStore } from "@/store/toast";
import { installAudioUnlock } from "@/lib/sounds";

const clear = () => useToastStore.getState().toasts.forEach((t) => useToastStore.getState().remove(t.id));

describe("ToastContainer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clear();
  });
  afterEach(() => {
    cleanup();
    useToastStore.getState().resume();
    clear();
    vi.useRealTimers();
  });

  it("renders nothing visible when there are no toasts and unlocks audio", () => {
    render(<ToastContainer />);
    expect(document.querySelector("[data-toast]")).toBeNull();
    expect(installAudioUnlock).toHaveBeenCalled();
  });

  it("draws success and info as pills", () => {
    render(<ToastContainer />);
    act(() => {
      toast.success("Saved");
      toast.info("FYI");
    });
    const pills = document.querySelectorAll('[data-toast="pill"]');
    expect(pills).toHaveLength(2);
    expect(pills[0]).toHaveAttribute("data-kind", "info");
    expect(screen.getAllByText("Saved").length).toBeGreaterThan(0);
  });

  it("puts a single action on the pill and removes the toast when used", () => {
    const onClick = vi.fn();
    render(<ToastContainer />);
    act(() => toast.success("Link copied", { label: "Open", onClick }));
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("shows a count when identical toasts merge", () => {
    render(<ToastContainer />);
    act(() => {
      toast.success("Link created");
      toast.success("Link created");
      toast.success("Link created");
    });
    expect(document.querySelectorAll('[data-toast="pill"]')).toHaveLength(1);
    expect(screen.getByLabelText("3 times")).toHaveTextContent("×3");
  });

  it("shows at most three pills and counts the older ones", () => {
    render(<ToastContainer />);
    act(() => {
      for (let i = 0; i < 5; i++) toast.info(`n${i}`);
    });
    expect(document.querySelectorAll('[data-toast="pill"]')).toHaveLength(3);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("draws warnings and errors as glass rows with detail, icon and action", () => {
    const onClick = vi.fn();
    const Custom = ({ className }: { className?: string }) => <i data-testid="custom" className={className} />;
    render(<ToastContainer />);
    act(() => {
      toast.error("Upload failed", { label: "Retry", onClick }, { detail: "Network dropped", icon: Custom });
      toast.warning("Careful");
    });
    const rows = document.querySelectorAll('[data-toast="glass"]');
    expect(rows).toHaveLength(2);
    const error = document.querySelector('[data-toast="glass"][data-kind="error"]') as HTMLElement;
    expect(error.style.borderColor).toContain("var(--toast-error)");
    expect(screen.getByText("Network dropped")).toBeInTheDocument();
    expect(screen.getByTestId("custom")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("uses a thumbnail instead of the icon tile and keeps a neutral border for warnings", () => {
    render(<ToastContainer />);
    act(() => toast.warning("Big file", { thumbnail: "blob:thumb" }));
    const row = document.querySelector('[data-toast="glass"]') as HTMLElement;
    expect(row.querySelector("img")).toHaveAttribute("src", "blob:thumb");
    expect(row.style.borderColor).toBe("var(--color-border)");
  });

  it("collapses older glass rows beyond three", () => {
    render(<ToastContainer />);
    act(() => {
      for (let i = 0; i < 5; i++) toast.warning(`w${i}`);
    });
    expect(document.querySelectorAll('[data-toast="glass"]')).toHaveLength(3);
    expect(screen.getByText("+2")).toBeInTheDocument();
  });

  it("dismisses a glass row from its close button", () => {
    render(<ToastContainer />);
    act(() => toast.error("Gone soon"));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss notification: Gone soon" }));
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("announces errors assertively and everything else politely", () => {
    render(<ToastContainer />);
    act(() => {
      toast.error("E1");
      toast.warning("W1");
      toast.success("S1");
    });
    const assertive = document.querySelector('[aria-live="assertive"]') as HTMLElement;
    const polite = document.querySelector('[aria-live="polite"]') as HTMLElement;
    expect(assertive).toHaveTextContent("E1");
    expect(assertive).not.toHaveTextContent("W1");
    expect(polite).toHaveTextContent("W1");
    expect(polite).toHaveTextContent("S1");
  });

  describe("undo bar", () => {
    it("renders the message, detail, an Undo action and a countdown ring", () => {
      const onUndo = vi.fn();
      render(<ToastContainer />);
      act(() => toast.undo("Moved 3 files", onUndo, { detail: "To Trips" }));
      const bar = document.querySelector('[data-toast="undo"]') as HTMLElement;
      expect(bar).toHaveTextContent("Moved 3 files");
      expect(bar).toHaveTextContent("To Trips");
      expect(screen.getByRole("img", { name: "8 seconds left to undo" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(onUndo).toHaveBeenCalledOnce();
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("counts the seconds down and shows a merge count", () => {
      render(<ToastContainer />);
      act(() => {
        toast.undo("Deleted", vi.fn());
        toast.undo("Deleted", vi.fn());
      });
      expect(screen.getByLabelText("2 times")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("img", { name: "5 seconds left to undo" })).toBeInTheDocument();
      const ring = document.querySelector("[data-ring]") as SVGElement;
      expect(Number(ring.getAttribute("stroke-dashoffset"))).toBeCloseTo(62.8 * (1 - 5 / 8), 1);
    });

    it("pauses the countdown while hovered or focused and resumes after", () => {
      render(<ToastContainer />);
      act(() => toast.undo("Deleted", vi.fn()));
      const region = document.querySelector('[data-toast="undo"]')!.parentElement as HTMLElement;
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      fireEvent.mouseEnter(region);
      act(() => {
        vi.advanceTimersByTime(30000);
      });
      expect(screen.getByRole("img", { name: "6 seconds left to undo" })).toBeInTheDocument();
      fireEvent.mouseLeave(region);
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(screen.getByRole("img", { name: "5 seconds left to undo" })).toBeInTheDocument();
      fireEvent.focus(screen.getByRole("button", { name: "Undo" }));
      act(() => {
        vi.advanceTimersByTime(30000);
      });
      expect(useToastStore.getState().toasts).toHaveLength(1);
      fireEvent.blur(screen.getByRole("button", { name: "Undo" }));
      act(() => {
        vi.advanceTimersByTime(8000);
      });
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("keeps only the two newest undo bars", () => {
      render(<ToastContainer />);
      act(() => {
        toast.undo("one", vi.fn());
        toast.undo("two", vi.fn());
        toast.undo("three", vi.fn());
      });
      expect(document.querySelectorAll('[data-toast="undo"]')).toHaveLength(2);
    });

    it("does not put undo toasts in the pill or glass lanes", () => {
      render(<ToastContainer />);
      act(() => toast.undo("x", vi.fn()));
      expect(document.querySelector('[data-toast="pill"]')).toBeNull();
      expect(document.querySelector('[data-toast="glass"]')).toBeNull();
    });
  });

  describe("keyboard", () => {
    it("Escape dismisses the newest toast", () => {
      render(<ToastContainer />);
      act(() => {
        toast.success("older");
        toast.error("newer");
      });
      fireEvent.keyDown(window, { key: "Escape" });
      expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(["older"]);
    });

    it("ignores other keys, handled events and open dialogs", () => {
      render(<ToastContainer />);
      act(() => toast.success("stay"));
      fireEvent.keyDown(window, { key: "Enter" });
      const handled = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
      handled.preventDefault();
      window.dispatchEvent(handled);
      const dialog = document.createElement("div");
      dialog.setAttribute("role", "alertdialog");
      document.body.appendChild(dialog);
      fireEvent.keyDown(window, { key: "Escape" });
      dialog.remove();
      expect(useToastStore.getState().toasts).toHaveLength(1);
    });

    it("stops listening once the last toast is gone", () => {
      const remove = vi.spyOn(window, "removeEventListener");
      render(<ToastContainer />);
      act(() => toast.success("a"));
      act(() => {
        vi.advanceTimersByTime(4000);
      });
      expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
      remove.mockRestore();
    });
  });
});
