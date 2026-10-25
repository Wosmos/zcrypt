import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { playSound } = vi.hoisted(() => ({ playSound: vi.fn() }));
vi.mock("@/lib/sounds", () => ({ playSound }));

import { useToastStore, toast, toastRemainingMs } from "@/store/toast";

const list = () => useToastStore.getState().toasts;

describe("useToastStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    playSound.mockClear();
    list().forEach((t) => useToastStore.getState().remove(t.id));
  });

  afterEach(() => {
    useToastStore.getState().resume();
    vi.useRealTimers();
  });

  it("starts empty", () => {
    expect(list()).toEqual([]);
  });

  it("add() appends a toast with a generated id and a count of one", () => {
    useToastStore.getState().add("success", "Saved!");
    expect(list()).toHaveLength(1);
    expect(list()[0]).toMatchObject({ type: "success", message: "Saved!", count: 1 });
    expect(list()[0].id).toMatch(/^toast_\d+$/);
  });

  it("assigns unique ids to successive toasts", () => {
    useToastStore.getState().add("info", "one");
    useToastStore.getState().add("info", "two");
    const [a, b] = list();
    expect(a.id).not.toBe(b.id);
  });

  it("auto-dismisses success and info after 4 seconds", () => {
    useToastStore.getState().add("info", "gone soon");
    vi.advanceTimersByTime(3999);
    expect(list()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(list()).toHaveLength(0);
  });

  it("keeps warnings for 6 seconds and errors for 8", () => {
    toast.warning("careful");
    toast.error("broken");
    vi.advanceTimersByTime(6000);
    expect(list().map((t) => t.type)).toEqual(["error"]);
    vi.advanceTimersByTime(2000);
    expect(list()).toHaveLength(0);
  });

  it("keeps a success that carries an action for 7 seconds", () => {
    toast.success("Moved", { label: "View", onClick: vi.fn() });
    expect(list()[0].duration).toBe(7000);
    vi.advanceTimersByTime(6999);
    expect(list()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(list()).toHaveLength(0);
  });

  it("keeps an error with an action until it is acted on or dismissed", () => {
    toast.error("Upload failed", { label: "Retry", onClick: vi.fn() });
    vi.advanceTimersByTime(10 * 60 * 1000);
    expect(list()).toHaveLength(1);
    expect(toastRemainingMs(list()[0].id)).toBeNull();
    useToastStore.getState().remove(list()[0].id);
    expect(list()).toHaveLength(0);
  });

  it("honours a custom duration", () => {
    toast.info("quick", { durationMs: 500 });
    vi.advanceTimersByTime(500);
    expect(list()).toHaveLength(0);
  });

  it("remove() removes a toast by id and ignores unknown ids", () => {
    useToastStore.getState().add("success", "a");
    useToastStore.getState().add("success", "b");
    useToastStore.getState().remove("nonexistent");
    expect(list()).toHaveLength(2);
    useToastStore.getState().remove(list()[0].id);
    expect(list().map((t) => t.message)).toEqual(["b"]);
  });

  it("removeNewest() dismisses the latest toast and tolerates an empty list", () => {
    useToastStore.getState().removeNewest();
    useToastStore.getState().add("success", "old");
    useToastStore.getState().add("info", "new");
    useToastStore.getState().removeNewest();
    expect(list().map((t) => t.message)).toEqual(["old"]);
  });

  describe("merging", () => {
    it("merges identical messages within 2 seconds into one toast with a count", () => {
      toast.success("Link created");
      vi.advanceTimersByTime(1500);
      toast.success("Link created");
      vi.advanceTimersByTime(1500);
      toast.success("Link created");
      expect(list()).toHaveLength(1);
      expect(list()[0].count).toBe(3);
    });

    it("restarts the timer when a toast merges", () => {
      toast.success("Link created");
      vi.advanceTimersByTime(3000);
      toast.success("Link created");
      vi.advanceTimersByTime(3000);
      expect(list()).toHaveLength(1);
      vi.advanceTimersByTime(1000);
      expect(list()).toHaveLength(0);
    });

    it("does not restart the timer of a merged toast while paused", () => {
      toast.success("Link created");
      useToastStore.getState().pause();
      toast.success("Link created");
      vi.advanceTimersByTime(60000);
      expect(list()).toHaveLength(1);
      useToastStore.getState().resume();
      vi.advanceTimersByTime(4000);
      expect(list()).toHaveLength(0);
    });

    it("leaves other toasts alone when one merges", () => {
      toast.success("first");
      toast.info("other");
      toast.success("first");
      expect(list().map((t) => [t.message, t.count])).toEqual([["first", 2], ["other", 1]]);
    });

    it("merges a sticky toast without arming a timer", () => {
      toast.error("Upload failed", { label: "Retry", onClick: vi.fn() });
      toast.error("Upload failed", { label: "Retry", onClick: vi.fn() });
      expect(list()).toHaveLength(1);
      expect(list()[0].count).toBe(2);
      vi.advanceTimersByTime(60000);
      expect(list()).toHaveLength(1);
    });

    it("does not merge after the 2 second window or across kinds", () => {
      toast.success("Same");
      vi.advanceTimersByTime(2001);
      toast.success("Same");
      toast.error("Same");
      expect(list()).toHaveLength(3);
    });

    it("merges by key and keeps the newest message and detail", () => {
      toast.success("1 link created", { key: "links", detail: "a" });
      toast.success("2 links created", { key: "links" });
      expect(list()).toHaveLength(1);
      expect(list()[0]).toMatchObject({ message: "2 links created", detail: "a", count: 2 });
      toast.success("3 links created", { key: "links", detail: "b" });
      expect(list()[0].detail).toBe("b");
    });
  });

  describe("capping", () => {
    it("never lets successes push an error out", () => {
      toast.error("keep me");
      for (let i = 0; i < 9; i++) toast.success(`ok ${i}`);
      expect(list()).toHaveLength(6);
      expect(list().some((t) => t.message === "keep me")).toBe(true);
    });

    it("drops the oldest of the least important kind first", () => {
      toast.warning("w1");
      toast.info("i1");
      toast.success("s1");
      for (let i = 0; i < 3; i++) toast.error(`e${i}`);
      toast.error("e3");
      expect(list().map((t) => t.message)).toEqual(["w1", "i1", "e0", "e1", "e2", "e3"]);
      toast.error("e4");
      expect(list().map((t) => t.message)).toEqual(["w1", "e0", "e1", "e2", "e3", "e4"]);
    });

    it("drops a warning, then an error, when nothing softer is left", () => {
      for (let i = 0; i < 6; i++) toast.warning(`w${i}`);
      toast.error("e");
      expect(list().map((t) => t.message)).toEqual(["w1", "w2", "w3", "w4", "w5", "e"]);
      for (let i = 0; i < 6; i++) toast.error(`x${i}`);
      expect(list().every((t) => t.type === "error")).toBe(true);
      expect(list()).toHaveLength(6);
    });

    it("never drops an undo toast while anything else can go", () => {
      toast.undo("Deleted", vi.fn());
      for (let i = 0; i < 9; i++) toast.success(`ok ${i}`);
      expect(list().some((t) => t.undo)).toBe(true);
    });

    it("falls back to the oldest toast when only undo toasts remain", () => {
      for (let i = 0; i < 7; i++) toast.undo(`u${i}`, vi.fn());
      expect(list()).toHaveLength(6);
      expect(list()[0].message).toBe("u1");
    });
  });

  describe("pause / resume", () => {
    it("holds the countdown while paused and resumes with the remaining time", () => {
      useToastStore.getState().add("info", "hover me");
      vi.advanceTimersByTime(3000);
      useToastStore.getState().pause();
      vi.advanceTimersByTime(60000);
      expect(list()).toHaveLength(1);
      expect(toastRemainingMs(list()[0].id)).toBe(1000);
      useToastStore.getState().resume();
      vi.advanceTimersByTime(999);
      expect(list()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(list()).toHaveLength(0);
    });

    it("does not start the countdown for a toast added while paused", () => {
      useToastStore.getState().pause();
      useToastStore.getState().add("info", "late");
      vi.advanceTimersByTime(60000);
      expect(list()).toHaveLength(1);
      useToastStore.getState().resume();
      vi.advanceTimersByTime(4000);
      expect(list()).toHaveLength(0);
    });

    it("pausing twice does not double-subtract elapsed time", () => {
      useToastStore.getState().add("info", "x");
      vi.advanceTimersByTime(1000);
      useToastStore.getState().pause();
      vi.advanceTimersByTime(1000);
      useToastStore.getState().pause();
      useToastStore.getState().resume();
      vi.advanceTimersByTime(2999);
      expect(list()).toHaveLength(1);
      vi.advanceTimersByTime(1);
      expect(list()).toHaveLength(0);
    });

    it("resume() leaves running timers alone and remove() cancels the timer", () => {
      useToastStore.getState().add("info", "x");
      useToastStore.getState().resume();
      useToastStore.getState().remove(list()[0].id);
      vi.advanceTimersByTime(4000);
      expect(list()).toHaveLength(0);
    });
  });

  describe("toastRemainingMs", () => {
    it("counts down while running and is null for unknown toasts", () => {
      toast.info("x");
      const id = list()[0].id;
      expect(toastRemainingMs(id)).toBe(4000);
      vi.advanceTimersByTime(1500);
      expect(toastRemainingMs(id)).toBe(2500);
      expect(toastRemainingMs("nope")).toBeNull();
    });
  });

  describe("toast helper", () => {
    it("proxies success/error/info/warning to add() with the right type", () => {
      toast.success("s");
      toast.error("e");
      toast.info("i");
      toast.warning("w");
      expect(list().map((t) => t.type)).toEqual(["success", "error", "info", "warning"]);
    });

    it("attaches an optional action to the toast", () => {
      const onClick = vi.fn();
      toast.success("undo me", { label: "Open", onClick });
      const [t] = list();
      expect(t.action?.label).toBe("Open");
      t.action?.onClick();
      expect(onClick).toHaveBeenCalledOnce();
    });

    it("accepts options as the second argument and an action with options as the third", () => {
      const icon = () => null;
      toast.info("opts", { detail: "more", icon, thumbnail: "blob:x" });
      toast.warning("both", { label: "Retry", onClick: vi.fn() }, { detail: "d" });
      expect(list()[0]).toMatchObject({ detail: "more", icon, thumbnail: "blob:x" });
      expect(list()[0].action).toBeUndefined();
      expect(list()[1]).toMatchObject({ detail: "d", action: { label: "Retry" } });
    });

    it("omits action when not provided", () => {
      toast.info("no action");
      expect(list()[0].action).toBeUndefined();
    });

    it("toast.undo creates an 8 second undo toast whose callback runs on demand", () => {
      const onUndo = vi.fn();
      toast.undo("Moved", onUndo, { detail: "to Trips" });
      const [t] = list();
      expect(t).toMatchObject({ message: "Moved", detail: "to Trips", duration: 8000 });
      t.undo?.();
      expect(onUndo).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(8000);
      expect(list()).toHaveLength(0);
    });
  });

  describe("sounds", () => {
    it("plays the problem cue for every error", () => {
      toast.error("bad");
      expect(playSound).toHaveBeenCalledWith("problem", "problems");
    });

    it("is silent for other kinds unless a cue is attached", () => {
      toast.success("fine");
      toast.warning("hmm");
      expect(playSound).not.toHaveBeenCalled();
      toast.success("done", { sound: { event: "done", area: "transfers" } });
      expect(playSound).toHaveBeenCalledWith("done", "transfers");
    });

    it("lets an error opt out", () => {
      toast.error("quiet", { sound: false });
      expect(playSound).not.toHaveBeenCalled();
    });
  });
});
