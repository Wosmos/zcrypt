import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup, act } from "@testing-library/react";

vi.mock("@/lib/transfer-crypto", async (orig) => ({
  ...(await orig<typeof import("@/lib/transfer-crypto")>()),
  deriveTransferKeys: async () => ({ key: new ArrayBuffer(32), confirm: "123456" }),
  sealMeta: async () => "meta",
  sealChunk: async () => "payload",
  openMeta: async (_k: unknown, sealed: string) => JSON.parse(sealed),
  openChunk: async () => new Uint8Array([1]),
  assembleTransfer: (chunks: (Uint8Array | undefined)[]) => {
    if (!chunks[0]) throw new Error("Transfer integrity check failed");
    return new Uint8Array([1]);
  },
  newPairingSecret: () => "AAAABBBBCCCCDDDD",
}));
vi.mock("@/lib/transfer-socket", async (orig) => ({
  ...(await orig<typeof import("@/lib/transfer-socket")>()),
  TRANSFER_ACK_WAIT_MS: 150,
}));
vi.mock("@/components/ui/qr-code", () => ({ QRShare: () => null }));

const saveBlob = vi.hoisted(() => vi.fn());
vi.mock("@/lib/utils", async (orig) => ({ ...(await orig<typeof import("@/lib/utils")>()), saveBlob }));

import { TransferTool } from "@/components/tools/transfer-tool";

class FakeWS {
  static instances: FakeWS[] = [];
  static OPEN = 1;
  static CLOSED = 3;
  readyState = 1;
  bufferedAmount = 0;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  constructor() {
    FakeWS.instances.push(this);
    setTimeout(() => this.onopen?.(), 0);
  }
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close() {
    this.readyState = 3;
  }
  push(msg: unknown) {
    return act(async () => {
      this.onmessage?.({ data: JSON.stringify(msg) });
      await new Promise((r) => setTimeout(r, 5));
    });
  }
  types() {
    return this.sent.map((m) => m.type);
  }
}

beforeEach(() => {
  FakeWS.instances = [];
  vi.stubGlobal("WebSocket", FakeWS);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const ws = () => FakeWS.instances[FakeWS.instances.length - 1];

async function startSender() {
  render(<TransferTool />);
  fireEvent.click(screen.getByRole("button", { name: /Send a File/ }));
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { files: [new File([new Uint8Array(10)], "a.bin")] } });
  });
  fireEvent.click(await screen.findByRole("button", { name: /Start Transfer/ }));
  await waitFor(() => expect(FakeWS.instances.length).toBe(1));
  await ws().push({ type: "code", data: "123456" });
  await ws().push({ type: "paired" });
  await waitFor(() => expect(ws().types()).toContain("done"), { timeout: 3000 });
}

describe("device transfer sender", () => {
  it("shows done only after the receiver's ack", async () => {
    await startSender();
    expect(screen.queryByText("Transfer Complete")).not.toBeInTheDocument();
    expect(screen.getByText(/Waiting for the other device to confirm/)).toBeInTheDocument();
    await ws().push({ type: "ack" });
    expect(await screen.findByText("Transfer Complete")).toBeInTheDocument();
  });

  it("does not report success when the connection drops before the ack", async () => {
    await startSender();
    await act(async () => {
      ws().readyState = 3;
      ws().onclose?.();
    });
    expect(screen.queryByText("Transfer Complete")).not.toBeInTheDocument();
    expect(await screen.findByText("Transfer Failed")).toBeInTheDocument();
  });

  it("times out without an ack instead of claiming success", async () => {
    await startSender();
    expect(await screen.findByText(/did not confirm/, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.queryByText("Transfer Complete")).not.toBeInTheDocument();
  });

  it("Cancel tells the receiver and closes quietly, with no error screen", async () => {
    await startSender();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(ws().types()).toContain("cancel");
    expect(ws().readyState).toBe(3);
    expect(screen.queryByText("Transfer Failed")).not.toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Start Transfer/ })).toBeInTheDocument();
  });

  it("an ack-less cancel from the receiver ends the transfer with a clear message", async () => {
    await startSender();
    await ws().push({ type: "cancel" });
    expect(await screen.findByText(/other device cancelled/)).toBeInTheDocument();
  });
});

async function startReceiver() {
  render(<TransferTool />);
  fireEvent.click(screen.getByRole("button", { name: /Receive a File/ }));
  const inputs = screen.getAllByRole("textbox");
  fireEvent.change(inputs[0], { target: { value: "123456" } });
  fireEvent.change(inputs[1], { target: { value: "AAAABBBBCCCCDDDD" } });
  fireEvent.click(screen.getByRole("button", { name: /Connect/ }));
  await waitFor(() => expect(FakeWS.instances.length).toBe(1));
  await ws().push({ type: "paired" });
}

describe("device transfer receiver", () => {
  it("refuses a file above the in-memory cap, tells the sender and does not receive it", async () => {
    await startReceiver();
    await ws().push({
      type: "file_info",
      data: { meta: JSON.stringify({ name: "x", size: 2 * 1024 ** 3, type: "", chunks: 5 }) },
    });
    expect(await screen.findByText(/too large to receive in the browser/)).toBeInTheDocument();
    expect(ws().types()).toContain("cancel");
  });

  it("acks once the whole file is assembled and saved", async () => {
    await startReceiver();
    await ws().push({
      type: "file_info",
      data: { meta: JSON.stringify({ name: "x.bin", size: 1, type: "", chunks: 1 }) },
    });
    await ws().push({ type: "chunk", data: { index: 0, total: 1, payload: "p" } });
    await ws().push({ type: "done" });
    expect(saveBlob).toHaveBeenCalledTimes(1);
    expect(ws().types()).toContain("ack");
  });

  it("does not ack a file that fails its integrity check", async () => {
    await startReceiver();
    await ws().push({
      type: "file_info",
      data: { meta: JSON.stringify({ name: "x.bin", size: 1, type: "", chunks: 1 }) },
    });
    await ws().push({ type: "done" });
    expect(saveBlob).not.toHaveBeenCalled();
    expect(ws().types()).not.toContain("ack");
  });
});
