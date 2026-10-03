import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { type AuthUser, Role } from "@/types";

const { api, auth, router, toast, saveBlob } = vi.hoisted(() => ({
  api: { deleteAccount: vi.fn(), exportAccount: vi.fn() },
  auth: {
    user: null as AuthUser | null,
    accessToken: "tok" as string | null,
    clearAuth: vi.fn(),
  },
  router: { push: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
  saveBlob: vi.fn(),
}));

vi.mock("@/lib/auth-api", () => api);
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/store/toast", () => ({ toast }));
vi.mock("@/components/ui/logo-spinner", () => ({ LogoSpinner: () => <span>loading</span> }));
vi.mock("@/store/auth", () => ({
  useAuthStore: Object.assign((select: (s: typeof auth) => unknown) => select(auth), {
    getState: () => auth,
  }),
}));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  saveBlob,
}));

import { AccountData } from "@/components/settings/account-data";

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

function openDialog() {
  fireEvent.click(screen.getByRole("button", { name: "Delete account" }));
  return screen.getByRole("dialog");
}

describe("AccountData", () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    auth.user = user();
    auth.accessToken = "tok";
  });

  it("downloads the export as pretty JSON through saveBlob", async () => {
    api.exportAccount.mockResolvedValue({ version: 1 });
    render(<AccountData />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Account data downloaded"));
    expect(api.exportAccount).toHaveBeenCalledWith("tok");
    expect(saveBlob).toHaveBeenCalledWith(
      expect.stringMatching(/^zcrypt-account-\d{4}-\d{2}-\d{2}\.json$/),
      JSON.stringify({ version: 1 }, null, 2),
      "application/json",
    );
  });

  it("shows the server's reason when the export fails", async () => {
    api.exportAccount.mockRejectedValue(new Error("too many exports"));
    render(<AccountData />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("too many exports"));
    expect(saveBlob).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Download" })).toBeEnabled();
  });

  it("does nothing without a session", () => {
    auth.accessToken = null;
    render(<AccountData />);
    fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(api.exportAccount).not.toHaveBeenCalled();
  });

  it("asks only for the password when 2FA is off, then signs out", async () => {
    api.deleteAccount.mockResolvedValue({ deletion_scheduled_at: "2026-10-10T00:00:00Z" });
    render(<AccountData />);
    openDialog();
    expect(screen.queryByLabelText("2FA code")).not.toBeInTheDocument();

    const submit = screen.getByRole("button", { name: "Delete my account" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login"));
    expect(api.deleteAccount).toHaveBeenCalledWith("tok", "pw", "");
    expect(auth.clearAuth).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("scheduled for deletion"));
  });

  it("requires a 2FA code when 2FA is on", async () => {
    auth.user = user({ totp_enabled: true });
    api.deleteAccount.mockResolvedValue({ deletion_scheduled_at: "2026-10-10T00:00:00Z" });
    render(<AccountData />);
    openDialog();

    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    const submit = screen.getByRole("button", { name: "Delete my account" });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("2FA code"), { target: { value: " 123456 " } });
    fireEvent.click(submit);

    await waitFor(() => expect(api.deleteAccount).toHaveBeenCalledWith("tok", "pw", "123456"));
  });

  it("keeps the dialog open with the error when re-verification fails", async () => {
    api.deleteAccount.mockRejectedValue(new Error("password is incorrect"));
    render(<AccountData />);
    openDialog();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("password is incorrect");
    expect(auth.clearAuth).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("clears what was typed when the dialog is cancelled", () => {
    render(<AccountData />);
    openDialog();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    openDialog();
    expect(screen.getByLabelText("Password")).toHaveValue("");
  });
});
