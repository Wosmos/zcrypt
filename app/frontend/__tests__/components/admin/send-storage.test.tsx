import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import type { AdminSendStorageResponse } from "@/lib/api";
import { Role } from "@/types";

const { api, auth, toast } = vi.hoisted(() => ({
  api: {
    adminGetSendStorage: vi.fn(),
    adminSetSendPlatform: vi.fn(),
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
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

import { AdminSendStorage } from "@/components/admin/send-storage";

function wrapper({ children }: { children: React.ReactNode }) {
  return createElement(QueryClientProvider, { client: queryClient }, children);
}

const mockData = (): AdminSendStorageResponse => ({
  platform_setting: "telegram",
  options: [
    { key: "telegram:bot1", platform: "telegram", account: "bot1" },
    { key: "github:user1", platform: "github", account: "user1" },
  ],
  active: {
    platform: "telegram",
    account: "bot1",
    repo: "channel1",
  },
  usage: {
    transfers: 5,
    chunks: 50,
    bytes: 10485760,
    oldest_expires_at: "2026-10-04T12:00:00Z",
    by_location: [
      {
        platform: "telegram",
        account: "bot1",
        repo: "channel1",
        transfers: 5,
        chunks: 50,
        bytes: 10485760,
      },
    ],
  },
  limits: {
    max_file_bytes: 52428800,
    anon_daily_bytes: 524288000,
    user_daily_bytes: 5368709120,
  },
});

describe("AdminSendStorage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryClient.clear();
    queryClient.setDefaultOptions({ queries: { retry: false } });
    auth.user = { role: Role.Admin };
  });

  afterEach(cleanup);

  it("renders loading state", () => {
    api.adminGetSendStorage.mockImplementationOnce(() => new Promise(() => {}));
    const { container } = render(<AdminSendStorage />, { wrapper });
    expect(container.querySelector(".animate-shimmer")).toBeInTheDocument();
  });

  it("renders send storage data with usage bar", async () => {
    api.adminGetSendStorage.mockResolvedValueOnce(mockData());
    render(<AdminSendStorage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Send Storage")).toBeInTheDocument();
    });
    expect(screen.getByText("10 MB / 500 MB")).toBeInTheDocument();
  });

  it("renders limit badges", async () => {
    api.adminGetSendStorage.mockResolvedValueOnce(mockData());
    render(<AdminSendStorage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/50 MB per file/)).toBeInTheDocument();
    });
  });

  it("renders storage table on desktop", async () => {
    api.adminGetSendStorage.mockResolvedValueOnce(mockData());
    render(<AdminSendStorage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("10 MB / 500 MB")).toBeInTheDocument();
    });
  });

  it("renders error state when fetch fails", async () => {
    api.adminGetSendStorage.mockRejectedValueOnce(new Error("Failed to load"));
    render(<AdminSendStorage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("Couldn't load Send storage settings")).toBeInTheDocument();
    });
  });

  it("renders empty state when no locations", async () => {
    const emptyData = mockData();
    emptyData.usage.by_location = [];
    api.adminGetSendStorage.mockResolvedValueOnce(emptyData);
    render(<AdminSendStorage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText("No Sends stored right now")).toBeInTheDocument();
    });
  });

  it("shows encryption note", async () => {
    api.adminGetSendStorage.mockResolvedValueOnce(mockData());
    render(<AdminSendStorage />, { wrapper });

    await waitFor(() => {
      expect(screen.getByText(/Sends are encrypted before upload/)).toBeInTheDocument();
    });
  });
});
