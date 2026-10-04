import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import type { SystemStats, AdminHealthDetails } from "@/types";
import { Role } from "@/types";
import { createElement } from "react";

const { api, auth, toast } = vi.hoisted(() => ({
  api: {
    adminGetHealthDetails: vi.fn(),
    adminRunReconcile: vi.fn(),
  },
  auth: { user: null as unknown as { role: Role } | null },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api", () => api);
vi.mock("@/store/toast", () => ({ toast }));
vi.mock("@/store/auth", () => ({
  useAuthStore: (sel: (s: { user: unknown }) => unknown) => sel({ user: auth.user }),
}));
vi.mock("@/lib/query-client", () => {
  const actual = vi.importActual("@/lib/query-client");
  return actual;
});
vi.mock("@/components/ui/logo-spinner", () => ({
  LogoSpinner: () => <span data-testid="spinner">loading</span>,
}));

import { SystemStatsCards } from "@/components/admin/system-stats";

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

const stats = (over: Partial<SystemStats> = {}): SystemStats => ({
  total_users: 10,
  total_files: 100,
  total_size: 1000000,
  total_repos: 5,
  degraded_files: 0,
  damaged_files: 0,
  stuck_chunks: 0,
  ...over,
});

const healthDetails = (over: Partial<AdminHealthDetails> = {}): AdminHealthDetails => ({
  users: [
    {
      user_id: "u1",
      email: "alice@example.com",
      username: "alice",
      degraded_files: 1,
      damaged_files: 0,
      stuck_chunks: 2,
    },
  ],
  totals: { degraded_files: 1, damaged_files: 0, stuck_chunks: 2 },
  sample_files: [{ id: "f1", user_id: "u1", status: "degraded", reason: "not confirmed" }],
  ...over,
});

describe("SystemStatsCards with DurabilityAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    auth.user = { role: Role.Admin };
  });

  afterEach(cleanup);

  it("renders nothing when all health values are zero", () => {
    const { container } = render(
      <SystemStatsCards stats={stats({ degraded_files: 0, damaged_files: 0, stuck_chunks: 0 })} />,
      { wrapper },
    );
    expect(container.querySelector("[role='alert']")).not.toBeInTheDocument();
  });

  it("renders a summary strip when there are health problems", () => {
    render(
      <SystemStatsCards stats={stats({ degraded_files: 1, damaged_files: 0, stuck_chunks: 2 })} />,
      { wrapper },
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("1 degraded file, 2 stuck chunks");
  });

  it("prioritizes damaged files in the summary", () => {
    render(
      <SystemStatsCards stats={stats({ degraded_files: 1, damaged_files: 3, stuck_chunks: 2 })} />,
      { wrapper },
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "3 damaged files, 1 degraded file, 2 stuck chunks",
    );
  });

  it("renders affected users when popover is opened", async () => {
    api.adminGetHealthDetails.mockResolvedValueOnce(healthDetails());
    render(
      <SystemStatsCards stats={stats({ degraded_files: 1, damaged_files: 0, stuck_chunks: 2 })} />,
      { wrapper },
    );
    const button = screen.getByRole("alert");
    fireEvent.click(button);
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();
  });

  it("renders system totals in details", async () => {
    api.adminGetHealthDetails.mockResolvedValueOnce(healthDetails());
    render(
      <SystemStatsCards stats={stats({ degraded_files: 1, damaged_files: 0, stuck_chunks: 2 })} />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole("alert"));
    await waitFor(() => {
      expect(screen.getByText("System totals")).toBeInTheDocument();
    });
    expect(screen.getByText("1 degraded file")).toBeInTheDocument();
  });

  it("renders sample files in details when present", async () => {
    api.adminGetHealthDetails.mockResolvedValueOnce(
      healthDetails({
        sample_files: [
          { id: "file-1234-abcd", user_id: "u1", status: "degraded", reason: "not confirmed on platform" },
        ],
      }),
    );
    render(
      <SystemStatsCards stats={stats({ degraded_files: 1, damaged_files: 0, stuck_chunks: 2 })} />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole("alert"));
    await waitFor(() => {
      expect(screen.getByText("Sample files")).toBeInTheDocument();
      expect(screen.getByText("not confirmed on platform")).toBeInTheDocument();
    });
  });

  it("disables reconcile button and shows spinner while running", async () => {
    api.adminGetHealthDetails.mockResolvedValueOnce(healthDetails());
    let resolveReconcile: () => void = () => {};
    api.adminRunReconcile.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveReconcile = () => resolve({ total_orphans: 0, total_missing: 5, note: "done" } as never);
      }),
    );
    render(
      <SystemStatsCards stats={stats({ degraded_files: 1, damaged_files: 0, stuck_chunks: 2 })} />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole("alert"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run reconcile/i })).toBeInTheDocument();
    });
    const reconcileBtn = screen.getByRole("button", { name: /run reconcile/i });
    expect(reconcileBtn).not.toBeDisabled();
    fireEvent.click(reconcileBtn);
    await waitFor(() => {
      expect(reconcileBtn).toBeDisabled();
      expect(screen.getByTestId("spinner")).toBeInTheDocument();
    });
    resolveReconcile();
    await waitFor(() => {
      expect(reconcileBtn).not.toBeDisabled();
    });
    expect(api.adminRunReconcile).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows error toast when reconcile fails", async () => {
    api.adminGetHealthDetails.mockResolvedValueOnce(healthDetails());
    api.adminRunReconcile.mockRejectedValueOnce(new Error("reconcile failed"));
    render(
      <SystemStatsCards stats={stats({ degraded_files: 1, damaged_files: 0, stuck_chunks: 2 })} />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole("alert"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run reconcile/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /run reconcile/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("reconcile failed");
    });
  });

  it("closes details and refreshes after successful reconcile", async () => {
    api.adminGetHealthDetails.mockResolvedValueOnce(healthDetails());
    api.adminRunReconcile.mockResolvedValueOnce({ total_orphans: 0, total_missing: 5, note: "done" });
    render(
      <SystemStatsCards stats={stats({ degraded_files: 1, damaged_files: 0, stuck_chunks: 2 })} />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole("alert"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /run reconcile/i })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /run reconcile/i }));
    await waitFor(() => {
      expect(api.adminGetHealthDetails).toHaveBeenCalledTimes(2);
    });
  });

  it("renders stat cards below the alert", () => {
    render(<SystemStatsCards stats={stats()} />, { wrapper });
    expect(screen.getByText("Total users")).toBeInTheDocument();
    expect(screen.getByText("Total files")).toBeInTheDocument();
    expect(screen.getByText("Total storage")).toBeInTheDocument();
    expect(screen.getByText("Total repos")).toBeInTheDocument();
  });
});
