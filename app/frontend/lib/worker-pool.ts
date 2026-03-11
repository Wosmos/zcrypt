/**
 * Worker pool for parallel chunk processing (compress -> encrypt -> hash).
 *
 * Pool size is determined by the device profile (CPU/RAM aware).
 * Queue-based: idle worker picks next chunk from queue.
 */

import type { WorkerInput, WorkerOutput } from "@/workers/crypto-worker";
import { getDeviceProfile } from "@/lib/device-profile";

type QueueItem = {
  input: WorkerInput;
  resolve: (output: WorkerOutput) => void;
  reject: (error: Error) => void;
};

export class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: QueueItem[] = [];
  private terminated = false;

  constructor(poolSize?: number) {
    const size = poolSize ?? getDeviceProfile().workers;
    for (let i = 0; i < size; i++) {
      const worker = new Worker(
        new URL("../workers/crypto-worker.ts", import.meta.url),
        { type: "module" }
      );
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  /** Process a chunk through the worker pipeline. Returns a promise of the result. */
  process(input: WorkerInput): Promise<WorkerOutput> {
    if (this.terminated) {
      return Promise.reject(new Error("Worker pool has been terminated"));
    }

    return new Promise<WorkerOutput>((resolve, reject) => {
      const item: QueueItem = { input, resolve, reject };

      const worker = this.idle.pop();
      if (worker) {
        this.dispatch(worker, item);
      } else {
        this.queue.push(item);
      }
    });
  }

  private dispatch(worker: Worker, item: QueueItem) {
    const onMessage = (e: MessageEvent<WorkerOutput>) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);

      item.resolve(e.data);

      // Process next queued item or return to idle
      const next = this.queue.shift();
      if (next) {
        this.dispatch(worker, next);
      } else {
        this.idle.push(worker);
      }
    };

    const onError = (e: ErrorEvent) => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);

      item.reject(new Error(e.message || "Worker error"));

      // Return worker to pool even on error
      const next = this.queue.shift();
      if (next) {
        this.dispatch(worker, next);
      } else {
        this.idle.push(worker);
      }
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    // Transfer plaintext buffer (zero-copy send to worker)
    const transferable = [item.input.plaintext];
    worker.postMessage(item.input, transferable);
  }

  /** Terminate all workers and reject pending items. */
  terminate() {
    this.terminated = true;
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.idle = [];
    // Reject any queued items
    for (const item of this.queue) {
      item.reject(new Error("Worker pool terminated"));
    }
    this.queue = [];
  }

  /** Number of workers in the pool. */
  get size(): number {
    return this.workers.length;
  }
}
