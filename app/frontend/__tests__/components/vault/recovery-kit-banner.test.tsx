import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const kit = vi.hoisted(() => ({ status: null as { set: boolean; createdAt: string | null } | null }));

vi.mock("@/hooks/useRecoveryKit", () => ({ useRecoveryKit: () => ({ status: kit.status }) }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { RecoveryKitBanner } from "@/components/vault/recovery-kit-banner";
import { useAuthStore } from "@/store/auth";

const KNOWN = "zcrypt:recovery-kit-missing:u1";

describe("RecoveryKitBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    kit.status = null;
    useAuthStore.setState({ user: { id: "u1" } as never });
  });
  afterEach(() => {
    cleanup();
    useAuthStore.setState({ user: null });
  });

  it("never pops in on the load that first learns the kit is missing, and remembers it", () => {
    kit.status = { set: false, createdAt: null };
    render(<RecoveryKitBanner />);
    expect(screen.queryByText("title")).toBeNull();
    expect(localStorage.getItem(KNOWN)).toBe("1");
  });

  it("shows from the first paint when the last visit knew, and goes once a kit exists", () => {
    localStorage.setItem(KNOWN, "1");
    const { rerender } = render(<RecoveryKitBanner />);
    expect(screen.getByText("title")).toBeInTheDocument();

    kit.status = { set: true, createdAt: "2026-11-09T00:00:00Z" };
    rerender(<RecoveryKitBanner />);
    expect(screen.queryByText("title")).toBeNull();
    expect(localStorage.getItem(KNOWN)).toBeNull();
  });

  it("stays hidden for a week once dismissed", () => {
    localStorage.setItem(KNOWN, "1");
    render(<RecoveryKitBanner />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("title")).toBeNull();
    cleanup();
    render(<RecoveryKitBanner />);
    expect(screen.queryByText("title")).toBeNull();
  });

  it("shows nothing before the account is known", () => {
    useAuthStore.setState({ user: null });
    localStorage.setItem(KNOWN, "1");
    render(<RecoveryKitBanner />);
    expect(screen.queryByText("title")).toBeNull();
  });
});
