import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const q = vi.hoisted(() => ({ quota: null as Record<string, unknown> | null }));
vi.mock("@/hooks/useQuota", () => ({ useQuota: () => ({ quota: q.quota }) }));

import { SharedStorageBanner } from "@/components/dashboard/shared-storage-banner";

const quota = (over: Record<string, unknown> = {}) => ({
  can_upload: true,
  has_personal_key: false,
  is_unlimited: false,
  used_bytes: 100,
  quota_bytes: 1000,
  ...over,
});

describe("SharedStorageBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    q.quota = null;
  });
  afterEach(cleanup);

  it("renders nothing until the quota is known", () => {
    const { container } = render(<SharedStorageBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("nudges people on shared storage with an info banner, a usage bar and a link", () => {
    q.quota = quota();
    render(<SharedStorageBanner />);
    expect(document.querySelector('[data-banner="info"]')).not.toBeNull();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "10");
    expect(screen.getByRole("link")).toHaveAttribute("href", "/settings?tab=storage");
  });

  it("turns into a warning past 80 percent and cannot be dismissed past half", () => {
    q.quota = quota({ used_bytes: 900 });
    render(<SharedStorageBanner />);
    expect(document.querySelector('[data-banner="warning"]')).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("dismisses for a day when usage is low", async () => {
    q.quota = quota();
    render(<SharedStorageBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(document.querySelector("[data-banner]")).toBeNull());
    expect(localStorage.getItem("zcrypt:shared-storage-banner-dismissed-at")).not.toBeNull();
    cleanup();
    render(<SharedStorageBanner />);
    expect(document.querySelector("[data-banner]")).toBeNull();
  });

  it("shows again once the dismissal is older than a day or unreadable", () => {
    q.quota = quota();
    localStorage.setItem("zcrypt:shared-storage-banner-dismissed-at", String(Date.now() - 2 * 86_400_000));
    render(<SharedStorageBanner />);
    expect(document.querySelector("[data-banner]")).not.toBeNull();
    cleanup();
    localStorage.setItem("zcrypt:shared-storage-banner-dismissed-at", "nope");
    render(<SharedStorageBanner />);
    expect(document.querySelector("[data-banner]")).not.toBeNull();
  });

  it("always shows, with no usage bar, when uploads cannot start", () => {
    q.quota = quota({ can_upload: false, has_personal_key: true });
    render(<SharedStorageBanner />);
    expect(document.querySelector('[data-banner="warning"]')).not.toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });

  it("stays hidden for people with their own storage and for unlimited plans", () => {
    q.quota = quota({ has_personal_key: true });
    render(<SharedStorageBanner />);
    expect(document.querySelector("[data-banner]")).toBeNull();
    cleanup();
    q.quota = quota({ is_unlimited: true });
    render(<SharedStorageBanner />);
    expect(document.querySelector("[data-banner]")).toBeNull();
  });

  it("survives blocked storage", async () => {
    q.quota = quota();
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<SharedStorageBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    await waitFor(() => expect(document.querySelector("[data-banner]")).toBeNull());
    get.mockRestore();
    set.mockRestore();
  });

  it("handles a zero quota", () => {
    q.quota = quota({ quota_bytes: 0 });
    render(<SharedStorageBanner />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });
});
