import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const { api } = vi.hoisted(() => ({
  api: {
    getDeadManSwitch: vi.fn(),
    setupDeadManSwitch: vi.fn(),
    checkinDeadManSwitch: vi.fn(),
    deleteDeadManSwitch: vi.fn(),
    getDecoyStatus: vi.fn(),
    listDecoyFiles: vi.fn(),
    setupDecoy: vi.fn(),
    deleteDecoy: vi.fn(),
    addDecoyFile: vi.fn(),
    renameDecoyFile: vi.fn(),
    deleteDecoyFile: vi.fn(),
  },
}));

vi.mock("@/lib/api", () => api);
vi.mock("@/components/ui/logo-spinner", () => ({ LogoSpinner: () => <span>loading</span> }));
vi.mock("@/store/auth", () => ({
  useAuthStore: Object.assign((select: (s: { user: null }) => unknown) => select({ user: null }), {
    getState: () => ({ user: null }),
  }),
}));
vi.mock("@/lib/query-client", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});

import { queryClient } from "@/lib/query-client";
import { DeadManContent } from "@/components/settings/deadman-content";
import { DecoyContent } from "@/components/settings/decoy-content";

function wrap(ui: React.ReactNode) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("safeguard pages when the load fails", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("dead man's switch shows an error with retry, not the empty setup form", async () => {
    api.getDeadManSwitch.mockRejectedValueOnce(new Error("offline"));
    wrap(<DeadManContent />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
    expect(screen.queryByPlaceholderText("trusted-contact@example.com")).toBeNull();

    api.getDeadManSwitch.mockResolvedValueOnce(null);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("trusted-contact@example.com")).toBeInTheDocument(),
    );
  });

  it("decoy vault shows an error with retry, not the unconfigured state", async () => {
    api.getDecoyStatus.mockRejectedValueOnce(new Error("offline"));
    api.listDecoyFiles.mockResolvedValue([]);
    wrap(<DecoyContent />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);

    api.getDecoyStatus.mockResolvedValueOnce({ configured: false, enabled: false, file_count: 0 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});
