import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useToastStore, toast } from "@/store/toast";

describe("useToastStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts empty", () => {
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it("add() appends a toast with a generated id", () => {
    useToastStore.getState().add("success", "Saved!");
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ type: "success", message: "Saved!" });
    expect(toasts[0].id).toMatch(/^toast_\d+$/);
  });

  it("assigns unique ids to successive toasts", () => {
    useToastStore.getState().add("info", "one");
    useToastStore.getState().add("info", "two");
    const [a, b] = useToastStore.getState().toasts;
    expect(a.id).not.toBe(b.id);
  });

  it("auto-dismisses a toast after 4000ms", () => {
    useToastStore.getState().add("warning", "gone soon");
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("keeps a toast that carries an action for longer so Undo can be reached", () => {
    const onClick = vi.fn();
    toast.success("Moved", { label: "Undo", onClick });
    expect(useToastStore.getState().toasts[0]).toMatchObject({ duration: 7000 });
    vi.advanceTimersByTime(4000);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(3000);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("does not dismiss before the timeout elapses", () => {
    useToastStore.getState().add("error", "still here");
    vi.advanceTimersByTime(3999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("remove() removes a toast by id", () => {
    useToastStore.getState().add("success", "a");
    const id = useToastStore.getState().toasts[0].id;
    useToastStore.getState().remove(id);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it("remove() is a no-op for an unknown id", () => {
    useToastStore.getState().add("success", "a");
    useToastStore.getState().remove("nonexistent");
    expect(useToastStore.getState().toasts).toHaveLength(1);
  });

  it("only removes the matching toast when several are present", () => {
    useToastStore.getState().add("success", "a");
    useToastStore.getState().add("success", "b");
    const [first] = useToastStore.getState().toasts;
    useToastStore.getState().remove(first.id);
    const remaining = useToastStore.getState().toasts;
    expect(remaining).toHaveLength(1);
    expect(remaining[0].message).toBe("b");
  });

  describe("pause / resume", () => {
    afterEach(() => {
      useToastStore.getState().resume();
    });

    it("holds the countdown while paused and resumes with the remaining time", () => {
      useToastStore.getState().add("info", "hover me");
      vi.advanceTimersByTime(3000);
      useToastStore.getState().pause();
      vi.advanceTimersByTime(60000);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      useToastStore.getState().resume();
      vi.advanceTimersByTime(999);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("does not start the countdown for a toast added while paused", () => {
      useToastStore.getState().pause();
      useToastStore.getState().add("info", "late");
      vi.advanceTimersByTime(60000);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      useToastStore.getState().resume();
      vi.advanceTimersByTime(4000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("pausing twice does not double-subtract elapsed time", () => {
      useToastStore.getState().add("info", "x");
      vi.advanceTimersByTime(1000);
      useToastStore.getState().pause();
      vi.advanceTimersByTime(1000);
      useToastStore.getState().pause();
      useToastStore.getState().resume();
      vi.advanceTimersByTime(2999);
      expect(useToastStore.getState().toasts).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });

    it("resume() leaves running timers alone and remove() cancels the timer", () => {
      useToastStore.getState().add("info", "x");
      useToastStore.getState().resume();
      const id = useToastStore.getState().toasts[0].id;
      useToastStore.getState().remove(id);
      vi.advanceTimersByTime(4000);
      expect(useToastStore.getState().toasts).toHaveLength(0);
    });
  });

  describe("toast helper", () => {
    it("proxies success/error/info/warning to add() with the right type", () => {
      toast.success("s");
      toast.error("e");
      toast.info("i");
      toast.warning("w");
      const types = useToastStore.getState().toasts.map((t) => t.type);
      expect(types).toEqual(["success", "error", "info", "warning"]);
    });

    it("attaches an optional action to the toast", () => {
      const onClick = vi.fn();
      toast.success("undo me", { label: "Undo", onClick });
      const [t] = useToastStore.getState().toasts;
      expect(t.action?.label).toBe("Undo");
      t.action?.onClick();
      expect(onClick).toHaveBeenCalledOnce();
    });

    it("omits action when not provided", () => {
      toast.info("no action");
      const [t] = useToastStore.getState().toasts;
      expect(t.action).toBeUndefined();
    });
  });
});
