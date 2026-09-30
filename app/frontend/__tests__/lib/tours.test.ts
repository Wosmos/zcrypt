import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  const backing = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => (backing.has(k) ? backing.get(k)! : null),
      setItem: (k: string, v: string) => {
        backing.set(k, String(v));
      },
      removeItem: (k: string) => {
        backing.delete(k);
      },
      clear: () => backing.clear(),
    },
  });
});

import {
  TOUR_STEPS,
  hasSeenTour,
  markTourSeen,
  resetTours,
  resolveTour,
  tourSelector,
} from "@/lib/tours";

describe("tour storage", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it("is unseen until marked, per user", () => {
    expect(hasSeenTour("u1", "vault")).toBe(false);
    markTourSeen("u1", "vault");
    expect(hasSeenTour("u1", "vault")).toBe(true);
    expect(hasSeenTour("u1", "share")).toBe(false);
    expect(hasSeenTour("u2", "vault")).toBe(false);
  });

  it("does not duplicate entries", () => {
    markTourSeen("u1", "vault");
    markTourSeen("u1", "vault");
    markTourSeen("u1", "spaces");
    expect(JSON.parse(localStorage.getItem("zcrypt-tours:u1")!)).toEqual(["vault", "spaces"]);
  });

  it("resets one user only", () => {
    markTourSeen("u1", "vault");
    markTourSeen("u2", "vault");
    resetTours("u1");
    expect(hasSeenTour("u1", "vault")).toBe(false);
    expect(hasSeenTour("u2", "vault")).toBe(true);
  });

  it("tolerates corrupt or non-array values", () => {
    localStorage.setItem("zcrypt-tours:u1", "{oops");
    expect(hasSeenTour("u1", "vault")).toBe(false);
    localStorage.setItem("zcrypt-tours:u1", '{"a":1}');
    expect(hasSeenTour("u1", "vault")).toBe(false);
    localStorage.setItem("zcrypt-tours:u1", '["vault",3]');
    expect(hasSeenTour("u1", "vault")).toBe(true);
  });

  it("survives storage that throws", () => {
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(localStorage, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => markTourSeen("u1", "vault")).not.toThrow();
    expect(() => resetTours("u1")).not.toThrow();
  });
});

describe("resolveTour", () => {
  let visible = true;

  beforeEach(() => {
    document.body.innerHTML = "";
    visible = true;
    vi.spyOn(Element.prototype, "getClientRects").mockImplementation(function (this: Element) {
      const hidden = this.hasAttribute("data-hidden") || !visible;
      return (hidden ? [] : [{}]) as unknown as DOMRectList;
    });
  });
  afterEach(() => vi.restoreAllMocks());

  const add = (id: string, hidden = false) => {
    const el = document.createElement("div");
    el.setAttribute("data-tour", id);
    if (hidden) el.setAttribute("data-hidden", "");
    document.body.appendChild(el);
  };

  it("builds a selector", () => {
    expect(tourSelector("x")).toBe('[data-tour="x"]');
  });

  it("keeps steps whose target is visible and drops missing ones", () => {
    add("vault-search");
    add("upload-button");
    const steps = resolveTour("vault");
    expect(steps.map((s) => s.selector)).toEqual([
      '[data-tour="vault-search"]',
      '[data-tour="upload-button"]',
    ]);
    expect(steps[0]).toMatchObject({ showSkip: true, blockKeyboardControl: true });
  });

  it("skips desktop-only targets that are hidden and falls back to the mobile one", () => {
    add("upload-button", true);
    add("upload-fab");
    add("new-folder", true);
    const steps = resolveTour("vault");
    expect(steps.map((s) => s.selector)).toEqual(['[data-tour="upload-fab"]']);
  });

  it("keeps steps without a target", () => {
    const steps = resolveTour("spaces");
    expect(steps).toHaveLength(1);
    expect(steps[0].selector).toBeUndefined();
  });

  it("accepts a custom root and returns nothing when empty", () => {
    const root = document.createElement("div");
    expect(resolveTour("share", root)).toEqual([]);
  });

  it("has copy without em dashes", () => {
    const text = JSON.stringify(TOUR_STEPS);
    expect(text).not.toContain("—");
  });
});
