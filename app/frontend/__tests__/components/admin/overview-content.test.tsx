import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { Role } from "@/types";

const { hook } = vi.hoisted(() => ({ hook: { fetchAdminOverview: vi.fn() } }));
vi.mock("@/hooks/useAdminGuardedFetch", async (orig) => ({
  ...(await orig<typeof import("@/hooks/useAdminGuardedFetch")>()),
  fetchAdminOverview: hook.fetchAdminOverview,
}));
vi.mock("@/store/auth", () => ({
  useAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: { id: "me", role: Role.Admin } }),
}));
vi.mock("@/components/admin/token-management", () => ({ TokenManagement: () => null }));
vi.mock("@/components/admin/send-storage", () => ({ AdminSendStorage: () => null }));
vi.mock("@/components/admin/feedback-list", () => ({ FeedbackList: () => null }));
vi.mock("recharts", async (orig) => ({
  ...(await orig<typeof import("recharts")>()),
  ResponsiveContainer: () => null,
}));

import { AdminOverviewContent } from "@/components/admin/overview-content";

const overview = {
  total_users: 40,
  active_7d: 10,
  active_30d: 22,
  signups_this_week: 6,
  signups_last_week: 3,
  total_files: 120,
  total_size: 1048576,
  open_bug_reports: 4,
  stale_bug_reports: 2,
  pending_reviews: 1,
  emails_sending: 0,
  emails_queued: 0,
  emails_failed_30d: 0,
  pending_deletions: 0,
  series: [{ date: "2026-10-27", signups: 6, active: 10 }],
  countries: [{ country: "PK", count: 20 }, { country: "", count: 3 }],
  recent: [{ id: "e", event_type: "login", user_id: "u1", username: "alice", country: "PK", created_at: new Date().toISOString() }],
  stale_reports: [{ id: "r", description: "Upload stalls", created_at: new Date().toISOString() }],
};
const stats = { total_users: 40, total_files: 120, total_size: 1, total_repos: 3, degraded_files: 0, damaged_files: 0, stuck_chunks: 0 };

describe("AdminOverviewContent", () => {
  beforeEach(() => queryClient.clear());
  afterEach(cleanup);

  it("shows linked KPI tiles, countries, attention items and recent activity", async () => {
    hook.fetchAdminOverview.mockResolvedValue({ overview, stats });
    render(
      <QueryClientProvider client={queryClient}>
        <AdminOverviewContent />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("+100% vs the 7 days before (3)")).toBeInTheDocument();
    expect(screen.getByText("Users").closest("a")).toHaveAttribute("href", "/admin/users");
    expect(screen.getByText("25% of all users")).toBeInTheDocument();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/admin/users?country=PK");
    expect(screen.getByRole("link", { name: /Unknown/ })).toHaveAttribute("href", "/admin/users?country=unknown");
    expect(screen.getByText("2 bug reports open over a week").closest("a")).toHaveAttribute("href", "/admin/reports");
    expect(screen.getByText("Upload stalls")).toBeInTheDocument();
    expect(screen.getByText("User Login").closest("a")).toHaveAttribute("href", "/admin/users/u1");
    expect(hook.fetchAdminOverview).toHaveBeenCalledWith(30);
  });

  it("says all clear when nothing needs attention", async () => {
    hook.fetchAdminOverview.mockResolvedValue({
      overview: { ...overview, stale_bug_reports: 0, pending_reviews: 0, stale_reports: [] },
      stats,
    });
    render(
      <QueryClientProvider client={queryClient}>
        <AdminOverviewContent />
      </QueryClientProvider>,
    );
    expect(await screen.findByText("All clear. Nothing needs you right now.")).toBeInTheDocument();
  });
});
