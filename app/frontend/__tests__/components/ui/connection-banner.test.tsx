import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const conn = vi.hoisted(() => ({
  value: {
    status: "ok",
    known: true,
    retryIn: null as number | null,
    checking: false,
    recovering: false,
    check: vi.fn(),
  },
}));
vi.mock("@/hooks/useConnectivity", () => ({ useConnectivity: () => conn.value }));
vi.mock("motion/react", () => {
  const strip = ({ children, className }: { children?: ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  );
  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => <>{children}</>,
    motion: new Proxy({}, { get: () => strip }),
    useReducedMotion: () => false,
  };
});

import { ConnectionBanner, ConnectionStatusPill } from "@/components/ui/connection-banner";

const set = (over: Partial<typeof conn.value>) => {
  conn.value = { ...conn.value, ...over };
};

describe("ConnectionBanner", () => {
  beforeEach(() => {
    conn.value = { status: "ok", known: true, retryIn: null, checking: false, recovering: false, check: vi.fn() };
  });
  afterEach(cleanup);

  it("renders nothing visible while everything is fine", () => {
    render(<ConnectionBanner />);
    expect(document.querySelector("[data-banner]")).toBeNull();
  });

  it.each([
    ["offline", "error"],
    ["down", "warning"],
    ["maintenance", "info"],
    ["slow", "info"],
  ] as const)("maps %s to a %s banner", (status, kind) => {
    set({ status });
    render(<ConnectionBanner />);
    expect(document.querySelector(`[data-banner="${kind}"]`)).not.toBeNull();
  });

  it("offers Retry and a countdown for blocking states and runs the check", () => {
    set({ status: "offline", retryIn: 12 });
    render(<ConnectionBanner />);
    expect(screen.getByText(/12/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry now/ }));
    expect(conn.value.check).toHaveBeenCalledOnce();
  });

  it("shows a checking state without the countdown", () => {
    set({ status: "down", retryIn: 5, checking: true });
    render(<ConnectionBanner />);
    expect(screen.getByRole("button", { name: /Checking/ })).toBeDisabled();
    expect(screen.queryByText(/retry in/i)).toBeNull();
  });

  it("has no retry for slow or recovered and trims the body in the floating variant", () => {
    set({ status: "slow" });
    const { unmount } = render(<ConnectionBanner />);
    expect(screen.queryByRole("button", { name: /Retry/ })).toBeNull();
    unmount();
    set({ status: "ok", recovering: true });
    render(<ConnectionBanner />);
    expect(document.querySelector('[data-banner="success"]')).not.toBeNull();
    expect(document.querySelector('[data-banner="success"] p:nth-of-type(2)')).toBeNull();
  });

  it("keeps the body in the inline variant, even when recovered", () => {
    set({ status: "ok", recovering: true });
    render(<ConnectionBanner variant="inline" />);
    expect(document.querySelectorAll('[data-banner="success"] p')).toHaveLength(2);
  });

  it("renders the inline variant for a problem and announces it", () => {
    set({ status: "maintenance" });
    render(<ConnectionBanner variant="inline" />);
    expect(document.querySelector('[data-banner="info"]')).not.toBeNull();
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toMatch(/\./);
  });

  it("renders nothing inline while fine", () => {
    render(<ConnectionBanner variant="inline" />);
    expect(document.querySelector("[data-banner]")).toBeNull();
  });
});

describe("ConnectionStatusPill", () => {
  afterEach(cleanup);

  it("says it is still checking before the first answer", () => {
    set({ status: "ok", known: false });
    render(<ConnectionStatusPill />);
    expect(document.querySelector("p")).toBeInTheDocument();
  });

  it("renders a label for a known status", () => {
    set({ status: "offline", known: true });
    render(<ConnectionStatusPill className="x" />);
    expect(document.querySelector("p.x")).toBeInTheDocument();
  });

  it("pings when everything is fine", () => {
    set({ status: "ok", known: true });
    render(<ConnectionStatusPill />);
    expect(document.querySelector(".animate-ping")).not.toBeNull();
  });
});
