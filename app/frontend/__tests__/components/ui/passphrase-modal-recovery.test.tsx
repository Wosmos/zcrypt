import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const { api } = vi.hoisted(() => ({ api: { getRecoveryKit: vi.fn() } }));

vi.mock("@/lib/api", () => api);

import { PassphraseModal } from "@/components/ui/passphrase-modal";
import { usePassphraseStore } from "@/store/passphrase";
import {
  formatRecoveryKey,
  generateRecoveryKey,
  sealRecoveryBlob,
} from "@/lib/recovery-kit";

const PASSPHRASE = "the real vault passphrase";

async function kit() {
  const key = generateRecoveryKey();
  return { text: await formatRecoveryKey(key), blob: await sealRecoveryBlob(key, PASSPHRASE) };
}

function setup(verify = vi.fn().mockResolvedValue(true)) {
  const onConfirm = vi.fn();
  render(
    <PassphraseModal open allowRecovery verify={verify} onConfirm={onConfirm} onClose={vi.fn()} />,
  );
  fireEvent.click(screen.getByRole("button", { name: /forgot your passphrase/i }));
  return { onConfirm, verify };
}

function submitKey(text: string) {
  fireEvent.change(screen.getByLabelText("Recovery key"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Recover" }));
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  api.getRecoveryKit.mockReset();
  usePassphraseStore.setState({ cachedPassphrase: null, cacheUntil: null, persistent: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("PassphraseModal recovery path", () => {
  it("only offers recovery when allowRecovery is set", () => {
    render(<PassphraseModal open onConfirm={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /forgot your passphrase/i })).toBeNull();
  });

  it("switches to a recovery key input and back", () => {
    setup();
    expect(screen.getByLabelText("Recovery key")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Back to passphrase" }));
    expect(screen.getByPlaceholderText("Your encryption passphrase")).toBeInTheDocument();
  });

  it("explains a typo without any network call", async () => {
    setup();
    const { text } = await kit();
    const typo = `${text.slice(0, 8)}${text[8] === "A" ? "B" : "A"}${text.slice(9)}`;
    submitKey(typo);
    expect(await screen.findByRole("alert")).toHaveTextContent("has a typo");
    expect(api.getRecoveryKit).not.toHaveBeenCalled();
  });

  it("explains that recovery is impossible when no kit was saved", async () => {
    api.getRecoveryKit.mockResolvedValue(null);
    setup();
    submitKey((await kit()).text);
    expect(await screen.findByRole("alert")).toHaveTextContent("recovery isn't possible");
  });

  it("rejects a valid key that belongs to a different kit", async () => {
    const stored = await kit();
    api.getRecoveryKit.mockResolvedValue({ blob: stored.blob, created_at: "2026-11-09" });
    const { onConfirm } = setup();
    submitKey((await kit()).text);
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't match the kit");
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("recovers, can reveal the passphrase once, and unlocks through the normal path", async () => {
    const stored = await kit();
    api.getRecoveryKit.mockResolvedValue({ blob: stored.blob, created_at: "2026-11-09" });
    const { onConfirm, verify } = setup();

    submitKey(stored.text.toLowerCase());
    expect(await screen.findByText("Recovery key accepted")).toBeInTheDocument();
    expect(screen.queryByText(PASSPHRASE)).toBeNull();
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Show my passphrase" }));
    expect(screen.getByTestId("recovered-passphrase")).toHaveTextContent(PASSPHRASE);
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Unlock vault" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith(PASSPHRASE));
    expect(verify).toHaveBeenCalledWith(PASSPHRASE);
    expect(usePassphraseStore.getState().cachedPassphrase).toBe(PASSPHRASE);
  });

  it("stays locked when the recovered passphrase no longer matches the vault", async () => {
    const stored = await kit();
    api.getRecoveryKit.mockResolvedValue({ blob: stored.blob, created_at: "2026-11-09" });
    const { onConfirm } = setup(vi.fn().mockResolvedValue(false));

    submitKey(stored.text);
    fireEvent.click(await screen.findByRole("button", { name: "Unlock vault" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("doesn't match this vault");
    expect(onConfirm).not.toHaveBeenCalled();
    expect(usePassphraseStore.getState().cachedPassphrase).toBeNull();
  });
});
