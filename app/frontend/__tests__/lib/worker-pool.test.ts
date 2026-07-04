import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { WorkerInput, DecryptInput } from "@/workers/crypto-worker";

const deviceProfileMock = vi.hoisted(() => ({ workers: 3 }));
vi.mock("@/lib/device-profile", () => ({
  getDeviceProfile: () => deviceProfileMock,
}));

type PostedEntry = { worker: FakeWorker; msg: unknown; transfer: unknown[] };
let postedLog: PostedEntry[] = [];

class FakeWorker {
  static instances: FakeWorker[] = [];
  private listeners: Record<"message" | "error", ((e: unknown) => void)[]> = {
    message: [],
    error: [],
  };
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: "message" | "error", cb: (e: unknown) => void) {
    this.listeners[type].push(cb);
  }

  removeEventListener(type: "message" | "error", cb: (e: unknown) => void) {
    this.listeners[type] = this.listeners[type].filter((fn) => fn !== cb);
  }

  postMessage(msg: unknown, transfer: unknown[] = []) {
    postedLog.push({ worker: this, msg, transfer });
  }

  terminate() {
    this.terminated = true;
  }

  emitMessage(data: unknown) {
    for (const cb of this.listeners.message.slice()) cb({ data });
  }

  emitError(message: string) {
    for (const cb of this.listeners.error.slice()) cb({ message });
  }
}

import { WorkerPool } from "@/lib/worker-pool";

function encryptInput(chunkIndex: number): WorkerInput {
  return {
    chunkIndex,
    plaintext: new ArrayBuffer(4),
    keyBytes: new ArrayBuffer(4),
    compress: false,
  };
}

function decryptInput(chunkIndex: number): DecryptInput {
  return {
    mode: "decrypt",
    chunkIndex,
    encrypted: new ArrayBuffer(8),
    keyBytes: new ArrayBuffer(4),
    compressed: false,
  };
}

describe("WorkerPool", () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    postedLog = [];
    vi.stubGlobal("Worker", FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates poolSize workers from the device profile when none given", () => {
    const pool = new WorkerPool();
    expect(pool.size).toBe(3);
    expect(FakeWorker.instances).toHaveLength(3);
  });

  it("an explicit poolSize overrides the device profile", () => {
    const pool = new WorkerPool(2);
    expect(pool.size).toBe(2);
    expect(FakeWorker.instances).toHaveLength(2);
  });

  it("dispatches an encrypt input, transferring the plaintext buffer", async () => {
    const pool = new WorkerPool(1);
    const input = encryptInput(0);
    const promise = pool.process(input);

    expect(postedLog).toHaveLength(1);
    expect(postedLog[0].msg).toBe(input);
    expect(postedLog[0].transfer).toEqual([input.plaintext]);

    const output = {
      chunkIndex: 0,
      encrypted: new ArrayBuffer(16),
      sha256: "abc",
      compressed: false,
      originalSize: 4,
      compressedSize: 4,
      encryptedSize: 16,
    };
    postedLog[0].worker.emitMessage(output);

    await expect(promise).resolves.toBe(output);
  });

  it("dispatches a decrypt input, transferring the encrypted buffer", async () => {
    const pool = new WorkerPool(1);
    const input = decryptInput(1);
    const promise = pool.process(input);

    expect(postedLog[0].transfer).toEqual([input.encrypted]);

    const output = { chunkIndex: 1, plaintext: new ArrayBuffer(8) };
    postedLog[0].worker.emitMessage(output);

    await expect(promise).resolves.toBe(output);
  });

  it("reuses a freed worker for a second task instead of creating a new one", async () => {
    const pool = new WorkerPool(1);
    const p1 = pool.process(encryptInput(0));
    postedLog[0].worker.emitMessage({ chunkIndex: 0 });
    await p1;

    pool.process(encryptInput(1));
    expect(postedLog).toHaveLength(2);
    expect(postedLog[1].worker).toBe(postedLog[0].worker);
    expect(FakeWorker.instances).toHaveLength(1);
  });

  it("queues tasks beyond the pool size and dispatches them as workers free up", async () => {
    const pool = new WorkerPool(1);
    const p1 = pool.process(encryptInput(0));
    const p2 = pool.process(encryptInput(1));

    // Only the first task should have reached a worker; the second sits in queue.
    expect(postedLog).toHaveLength(1);

    postedLog[0].worker.emitMessage({ chunkIndex: 0 });
    await p1;

    // Freeing the worker should immediately dispatch the queued second task.
    expect(postedLog).toHaveLength(2);
    expect(postedLog[1].worker).toBe(postedLog[0].worker);

    postedLog[1].worker.emitMessage({ chunkIndex: 1 });
    await expect(p2).resolves.toEqual({ chunkIndex: 1 });
  });

  it("rejects the caller when a worker reports an error, then serves the next queued item", async () => {
    const pool = new WorkerPool(1);
    const p1 = pool.process(encryptInput(0));
    const p2 = pool.process(encryptInput(1));

    postedLog[0].worker.emitError("boom");
    await expect(p1).rejects.toThrow("boom");

    // Worker should have moved on to the queued item after the error.
    expect(postedLog).toHaveLength(2);
    postedLog[1].worker.emitMessage({ chunkIndex: 1 });
    await expect(p2).resolves.toEqual({ chunkIndex: 1 });
  });

  it("falls back to a generic message when the worker error has none", async () => {
    const pool = new WorkerPool(1);
    const p1 = pool.process(encryptInput(0));
    postedLog[0].worker.emitError("");
    await expect(p1).rejects.toThrow("Worker error");
  });

  it("terminate() stops all workers, rejects queued items, and zeroes the pool", async () => {
    const pool = new WorkerPool(2);
    // Fill both workers so a third task is queued rather than dispatched.
    pool.process(encryptInput(0));
    pool.process(encryptInput(1));
    const p3 = pool.process(encryptInput(2));

    expect(postedLog).toHaveLength(2);

    pool.terminate();

    expect(FakeWorker.instances.every((w) => w.terminated)).toBe(true);
    expect(pool.size).toBe(0);
    await expect(p3).rejects.toThrow("Worker pool terminated");
  });

  it("rejects new work submitted after termination without touching any worker", async () => {
    const pool = new WorkerPool(1);
    pool.terminate();
    postedLog = [];

    await expect(pool.process(encryptInput(0))).rejects.toThrow(
      "Worker pool has been terminated"
    );
    expect(postedLog).toHaveLength(0);
  });
});
