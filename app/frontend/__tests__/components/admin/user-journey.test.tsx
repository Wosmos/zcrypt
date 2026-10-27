import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { Role } from "@/types";

const { api } = vi.hoisted(() => ({ api: { adminGetUserJourney: vi.fn() } }));
vi.mock("@/lib/api", () => api);
vi.mock("@/store/auth", () => ({
  useAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: { role: Role.Admin } }),
}));

import { UserJourney } from "@/components/admin/user-journey";

const now = new Date();
const families = { auth: 1, security: 0, files: 1, sharing: 0, storage: 0, admin: 1, account: 0 };
const page = {
  events: [
    { id: "1", kind: "admin_plan_change", family: "admin", created_at: now.toISOString(), ip_prefix: "", user_agent: "", device: "", metadata: { plan: "pro" }, actor: "root" },
    { id: "2", kind: "uploads", family: "files", created_at: now.toISOString(), ip_prefix: "", user_agent: "", device: "", metadata: {}, count: 2, bytes: 2048 },
    { id: "3", kind: "login", family: "auth", created_at: new Date(now.getTime() - 3 * 86400000).toISOString(), ip_prefix: "10.1.2.0", user_agent: "", device: "Firefox on Linux", metadata: { country: "DE", city: "Berlin" } },
  ],
  total: 3,
  limit: 30,
  offset: 0,
  families,
};

function renderJourney() {
  return render(
    <QueryClientProvider client={queryClient}>
      <UserJourney userId="u1" />
    </QueryClientProvider>,
  );
}

describe("UserJourney", () => {
  beforeEach(() => {
    queryClient.clear();
    api.adminGetUserJourney.mockReset();
  });
  afterEach(cleanup);

  it("groups events by day with readable details", async () => {
    api.adminGetUserJourney.mockResolvedValue(page);
    renderJourney();
    expect(await screen.findByText("Plan Changed")).toBeInTheDocument();
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("by root")).toBeInTheDocument();
    expect(screen.getByText("2 files, 2 KB")).toBeInTheDocument();
    expect(screen.getByText("Firefox on Linux")).toBeInTheDocument();
    expect(screen.getByText("Germany")).toBeInTheDocument();
    expect(screen.getByText("10.1.2.0")).toBeInTheDocument();
  });

  it("filters by family and asks the server for those kinds", async () => {
    api.adminGetUserJourney.mockResolvedValue(page);
    renderJourney();
    await screen.findByText("Plan Changed");
    expect(screen.getByRole("button", { name: /Sharing/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Admin/ }));
    await waitFor(() =>
      expect(api.adminGetUserJourney).toHaveBeenLastCalledWith("u1", { limit: 30, offset: 0, kinds: "admin" }),
    );
    expect(screen.getByRole("button", { name: /Admin/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows an empty state", async () => {
    api.adminGetUserJourney.mockResolvedValue({ ...page, events: [], total: 0 });
    renderJourney();
    expect(await screen.findByText("Nothing recorded yet")).toBeInTheDocument();
  });
});
