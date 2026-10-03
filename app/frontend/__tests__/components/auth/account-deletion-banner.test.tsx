import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type AuthUser, Role } from "@/types";

const { api, auth, toast } = vi.hoisted(() => ({
  api: { cancelAccountDeletion: vi.fn() },
  auth: {
    user: null as AuthUser | null,
    accessToken: "tok" as string | null,
    setUser: vi.fn(),
  },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth-api", () => api);
vi.mock("@/store/toast", () => ({ toast }));
vi.mock("@/components/ui/logo-spinner", () => ({ LogoSpinner: () => <span>loading</span> }));
vi.mock("@/store/auth", () => ({
  useAuthStore: Object.assign((select: (s: typeof auth) => unknown) => select(auth), {
    getState: () => auth,
  }),
}));

import { AccountDeletionBanner } from "@/components/auth/account-deletion-banner";

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  id: "u1",
  email: "a@example.com",
  username: "a",
  role: Role.User,
  email_verified: true,
  totp_enabled: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  ...over,
});

describe("AccountDeletionBanner", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    auth.accessToken = "tok";
  });

  it("renders nothing when no deletion is pending", () => {
    auth.user = user();
    const { container } = render(<AccountDeletionBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing while signed out", () => {
    auth.user = null;
    const { container } = render(<AccountDeletionBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it("keeps the account and drops the pending date from the user", async () => {
    auth.user = user({ deletion_scheduled_at: "2026-10-10T00:00:00Z" });
    api.cancelAccountDeletion.mockResolvedValue({ success: true });
    render(<AccountDeletionBanner />);
    expect(screen.getByRole("alert")).toHaveTextContent("This account will be deleted on");

    fireEvent.click(screen.getByRole("button", { name: "Keep my account" }));
    await waitFor(() =>
      expect(auth.setUser).toHaveBeenCalledWith({
        ...auth.user,
        deletion_scheduled_at: undefined,
      }),
    );
    expect(api.cancelAccountDeletion).toHaveBeenCalledWith("tok");
    expect(toast.success).toHaveBeenCalled();
  });

  it("reports a failed cancel and lets the user retry", async () => {
    auth.user = user({ deletion_scheduled_at: "2026-10-10T00:00:00Z" });
    api.cancelAccountDeletion.mockRejectedValue(new Error("no deletion is scheduled"));
    render(<AccountDeletionBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Keep my account" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("no deletion is scheduled"));
    expect(auth.setUser).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Keep my account" })).toBeEnabled();
  });

  it("does nothing without a session token", () => {
    auth.user = user({ deletion_scheduled_at: "2026-10-10T00:00:00Z" });
    auth.accessToken = null;
    render(<AccountDeletionBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Keep my account" }));
    expect(api.cancelAccountDeletion).not.toHaveBeenCalled();
  });
});
