import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";

const api = vi.hoisted(() => ({
  getDecoyStatus: vi.fn(),
  listDecoyFiles: vi.fn(),
  setupDecoy: vi.fn(),
  deleteDecoy: vi.fn(),
  addDecoyFile: vi.fn(),
  renameDecoyFile: vi.fn(),
  deleteDecoyFile: vi.fn(),
}));
vi.mock("@/lib/api", () => api);
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

import { DecoyContent } from "@/components/settings/decoy-content";
import { queryClient } from "@/lib/query-client";
import { useAuthStore } from "@/store/auth";

function renderDecoy() {
  return render(
    <QueryClientProvider client={queryClient}>
      <DecoyContent />
    </QueryClientProvider>,
  );
}

async function fillForm() {
  const decoy = await screen.findByLabelText("password");
  fireEvent.change(decoy, { target: { value: "duress-pass" } });
  fireEvent.change(screen.getByLabelText("confirmPassword"), { target: { value: "duress-pass" } });
  fireEvent.change(screen.getByLabelText("accountPassword"), { target: { value: "real-pass" } });
}

describe("decoy setup re-confirms the owner", () => {
  beforeEach(() => {
    queryClient.clear();
    for (const fn of Object.values(api)) fn.mockReset();
    api.getDecoyStatus.mockResolvedValue({ configured: false, enabled: false, file_count: 0 });
    api.listDecoyFiles.mockResolvedValue([]);
    api.setupDecoy.mockResolvedValue({ success: true });
  });
  afterEach(() => {
    cleanup();
    useAuthStore.setState({ user: null });
  });

  it("sends the account password with the new decoy password", async () => {
    useAuthStore.setState({ user: { id: "u1", totp_enabled: false } as never });
    renderDecoy();
    await fillForm();
    expect(screen.queryByLabelText("code")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "enable" }));
    await waitFor(() =>
      expect(api.setupDecoy).toHaveBeenCalledWith({
        decoy_password: "duress-pass",
        password: "real-pass",
        code: undefined,
      }),
    );
  });

  it("asks for a 2FA code too when 2FA is on", async () => {
    useAuthStore.setState({ user: { id: "u1", totp_enabled: true } as never });
    renderDecoy();
    await fillForm();
    fireEvent.change(screen.getByLabelText("code"), { target: { value: " 123456 " } });
    fireEvent.click(screen.getByRole("button", { name: "enable" }));
    await waitFor(() =>
      expect(api.setupDecoy).toHaveBeenCalledWith({
        decoy_password: "duress-pass",
        password: "real-pass",
        code: "123456",
      }),
    );
  });

  it("shows the server's refusal of a wrong account password", async () => {
    useAuthStore.setState({ user: { id: "u1", totp_enabled: false } as never });
    api.setupDecoy.mockRejectedValue(new Error("your current password is incorrect"));
    renderDecoy();
    await fillForm();
    fireEvent.click(screen.getByRole("button", { name: "enable" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("your current password is incorrect");
  });
});
