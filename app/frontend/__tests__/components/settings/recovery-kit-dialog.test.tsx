import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { api, toast } = vi.hoisted(() => ({
  api: { putRecoveryKit: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/api", () => api);
vi.mock("@/store/toast", () => ({ toast }));

import { RecoveryKitDialog } from "@/components/settings/recovery-kit-dialog";
import { openRecoveryBlob, parseRecoveryKey } from "@/lib/recovery-kit";

function setup(onSaved = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <RecoveryKitDialog
      open
      onOpenChange={onOpenChange}
      passphrase="my vault passphrase"
      replacing={false}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange };
}

async function shownKey(): Promise<string> {
  const el = await screen.findByTestId("recovery-key");
  await waitFor(() => expect(el.textContent).toMatch(/^ZCRYPT-/));
  return el.textContent ?? "";
}

beforeEach(() => {
  api.putRecoveryKit.mockReset().mockResolvedValue({ created_at: "2026-11-09T20:00:00Z" });
  toast.success.mockReset();
  toast.error.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("RecoveryKitDialog", () => {
  it("shows the key and keeps Save disabled until the last 4 characters are typed", async () => {
    setup();
    const key = await shownKey();
    const save = screen.getByRole("button", { name: "Save recovery kit" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/last 4 characters/i), {
      target: { value: key.slice(-4) === "ABCD" ? "WXYZ" : "ABCD" },
    });
    expect(save).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("doesn't match");
    expect(api.putRecoveryKit).not.toHaveBeenCalled();
  });

  it("saves the sealed blob once the tail matches, case-insensitively", async () => {
    const { onSaved, onOpenChange } = setup();
    const key = await shownKey();

    fireEvent.change(screen.getByLabelText(/last 4 characters/i), {
      target: { value: key.slice(-4).toLowerCase() },
    });
    const save = screen.getByRole("button", { name: "Save recovery kit" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() => expect(api.putRecoveryKit).toHaveBeenCalledTimes(1));
    const blob = api.putRecoveryKit.mock.calls[0][0] as string;
    expect(blob.startsWith("rk1:")).toBe(true);
    expect(await openRecoveryBlob(await parseRecoveryKey(key), blob)).toBe("my vault passphrase");

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("2026-11-09T20:00:00Z"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(toast.success).toHaveBeenCalled();
  });

  it("does not close and reports the failure when the server refuses", async () => {
    api.putRecoveryKit.mockRejectedValue(new Error("boom"));
    const { onSaved, onOpenChange } = setup();
    const key = await shownKey();

    fireEvent.change(screen.getByLabelText(/last 4 characters/i), {
      target: { value: key.slice(-4) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save recovery kit" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
