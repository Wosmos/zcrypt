import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import type { SessionInfo } from "@/lib/auth-api";

const { api, auth, toast } = vi.hoisted(() => ({
  api: { listSessions: vi.fn(), revokeSession: vi.fn(), revokeOtherSessions: vi.fn() },
  auth: { accessToken: "tok" as string | null },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-api", () => api);
vi.mock("@/store/toast", () => ({ toast }));
vi.mock("@/components/ui/logo-spinner", () => ({ LogoSpinner: () => <span>loading</span> }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/store/auth", () => ({
  useAuthStore: Object.assign((select: (s: typeof auth) => unknown) => select(auth), {
    getState: () => auth,
  }),
}));
vi.mock("@/lib/query-client", async () => {
  const { QueryClient } = await import("@tanstack/react-query");
  return { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) };
});

import { queryClient } from "@/lib/query-client";
import { SignedInDevices } from "@/components/settings/signed-in-devices";

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15";
const PHONE = "Mozilla/5.0 (Linux; Android 14) Chrome/130.0 Mobile Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/131.0";

const session = (id: string, user_agent: string, over: Partial<SessionInfo> = {}): SessionInfo => ({
  id,
  ip: "203.0.113.0",
  user_agent,
  started_at: "2026-09-01T00:00:00Z",
  last_active: "2026-10-01T00:00:00Z",
  expires_at: "2026-10-08T00:00:00Z",
  current: false,
  ...over,
});

function renderDevices() {
  return render(
    <QueryClientProvider client={queryClient}>
      <SignedInDevices />
    </QueryClientProvider>,
  );
}

describe("SignedInDevices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.accessToken = "tok";
  });

  afterEach(() => {
    cleanup();
    queryClient.clear();
  });

  it("lists devices with the calling one marked and no sign-out on it", async () => {
    api.listSessions.mockResolvedValue([
      session("s1", MAC, { current: true }),
      session("s2", PHONE, { ip: "" }),
    ]);
    renderDevices();

    expect(await screen.findByText("Safari on macOS")).toBeInTheDocument();
    expect(screen.getByText("This device")).toBeInTheDocument();
    expect(screen.getByText("Chrome on Android")).toBeInTheDocument();
    expect(screen.getByText("Unknown network")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Sign out 1 device" })).toBeInTheDocument();
    expect(api.listSessions).toHaveBeenCalledWith("tok");
  });

  it("labels unknown user agents and hides sign-out-everywhere when alone", async () => {
    api.listSessions.mockResolvedValue([session("s1", "", { current: true })]);
    renderDevices();

    expect(await screen.findByText("Unknown device")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign out \d/ })).not.toBeInTheDocument();
  });

  it("signs one device out after confirming", async () => {
    api.listSessions.mockResolvedValue([session("s1", MAC, { current: true }), session("s2", WIN)]);
    api.revokeSession.mockResolvedValue({ success: true });
    renderDevices();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Firefox on Windows (203.0.113.0) will be signed out");
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign out" }));

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Firefox on Windows signed out"),
    );
    expect(api.revokeSession).toHaveBeenCalledWith("tok", "s2");
    await waitFor(() => expect(api.listSessions).toHaveBeenCalledTimes(2));
  });

  it("reports a failed sign-out", async () => {
    api.listSessions.mockResolvedValue([session("s1", MAC, { current: true }), session("s2", WIN)]);
    api.revokeSession.mockRejectedValue(new Error("session not found"));
    renderDevices();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Sign out" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("session not found"));
  });

  it("signs every other device out", async () => {
    api.listSessions.mockResolvedValue([
      session("s1", MAC, { current: true }),
      session("s2", WIN),
      session("s3", PHONE),
    ]);
    api.revokeOtherSessions.mockResolvedValue({ revoked: 2 });
    renderDevices();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out 2 devices" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Sign out others" }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Signed out 2 other devices"));
    expect(api.revokeOtherSessions).toHaveBeenCalledWith("tok");
  });

  it("uses the singular when one other device is signed out", async () => {
    api.listSessions.mockResolvedValue([session("s1", MAC, { current: true }), session("s2", WIN)]);
    api.revokeOtherSessions.mockResolvedValue({ revoked: 1 });
    renderDevices();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out 1 device" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Sign out others" }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Signed out 1 other device"));
  });

  it("reports a failed sign-out-everywhere", async () => {
    api.listSessions.mockResolvedValue([session("s1", MAC, { current: true }), session("s2", WIN)]);
    api.revokeOtherSessions.mockRejectedValue(new Error("boom"));
    renderDevices();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out 1 device" }));
    fireEvent.click(
      within(screen.getByRole("alertdialog")).getByRole("button", { name: "Sign out others" }),
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("boom"));
  });

  it("offers a retry when the list fails to load", async () => {
    api.listSessions.mockRejectedValueOnce(new Error("offline"));
    api.listSessions.mockResolvedValueOnce([session("s1", MAC, { current: true })]);
    renderDevices();

    expect(await screen.findByText("Could not load your signed-in devices")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Safari on macOS")).toBeInTheDocument();
  });

  it("does not fetch while signed out", () => {
    auth.accessToken = null;
    renderDevices();
    expect(api.listSessions).not.toHaveBeenCalled();
  });
});
