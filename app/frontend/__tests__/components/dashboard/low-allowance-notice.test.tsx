import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const h = vi.hoisted(() => ({ quota: undefined as unknown }));
vi.mock("@/store/quota", () => ({ useQuotaQuery: () => ({ data: h.quota }) }));

import { LowAllowanceNotice } from "@/components/dashboard/low-allowance-notice";

const base = {
  used_bytes: 0,
  quota_bytes: 0,
  has_personal_key: true,
  is_unlimited: false,
  plan: "free",
  max_concurrent_uploads: 3,
  max_file_size: 0,
  can_upload: true,
  allows_byob: true,
};
const MB = 1024 * 1024;

beforeEach(() => sessionStorage.clear());
afterEach(cleanup);

describe("LowAllowanceNotice", () => {
  it("stays away while both windows have at least a tenth left, and for accounts with no limits", () => {
    h.quota = { ...base, relay_used_bytes: 800 * MB, relay_limit_bytes: 1000 * MB };
    const { container, unmount } = render(<LowAllowanceNotice />);
    expect(container).toBeEmptyDOMElement();
    unmount();
    h.quota = base;
    expect(render(<LowAllowanceNotice />).container).toBeEmptyDOMElement();
  });

  it("warns once the monthly window is under a tenth, with what is left and a link to the usage section", () => {
    h.quota = {
      ...base,
      relay_used_bytes: 950 * MB,
      relay_limit_bytes: 1000 * MB,
      relay_resets_at: "2026-12-01T00:00:00Z",
    };
    render(<LowAllowanceNotice />);
    expect(screen.getByText("Your transfer allowance is running low")).toBeInTheDocument();
    expect(screen.getByText(/Only 50 MB of this month's allowance is left. It resets on December 1/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See usage" })).toHaveAttribute("href", "/settings?tab=storage#usage-limits");
  });

  it("names the daily window when that one is the low one", () => {
    h.quota = {
      ...base,
      relay_used_bytes: 0,
      relay_limit_bytes: 100000 * MB,
      relay_day_used_bytes: 990 * MB,
      relay_day_limit_bytes: 1000 * MB,
      relay_day_resets_at: "2026-11-20T00:00:00Z",
    };
    render(<LowAllowanceNotice />);
    expect(screen.getByText(/Only 10 MB of today's allowance is left. It resets at 12:00 AM UTC/)).toBeInTheDocument();
  });

  it("stays hidden once dismissed", () => {
    h.quota = { ...base, relay_used_bytes: 950 * MB, relay_limit_bytes: 1000 * MB };
    const { unmount } = render(<LowAllowanceNotice />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText("Your transfer allowance is running low")).toBeNull();
    unmount();
    expect(render(<LowAllowanceNotice />).container).toBeEmptyDOMElement();
  });
});
