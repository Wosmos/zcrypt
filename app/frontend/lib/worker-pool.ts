/**
 * Worker pool for parallel chunk processing (compress -> encrypt -> hash).
 *
 * Pool size is determined by the device profile (CPU/RAM aware).
 * Queue-based: idle worker picks next chunk from queue.
 */

import type {
  WorkerInput,
  WorkerOutput,
  DecryptInput,
  DecryptOutput,
  WorkerFailure,
} from "@/workers/crypto-worker";
import { getDeviceProfile } from "@/lib/device-profile";

type PoolInput = WorkerInput | DecryptInput;
type PoolOutput = WorkerOutput | DecryptOutput;

type QueueItem = {
  input: PoolInput;
  resolve: (output: PoolOutput) => void;
  reject: (error: Error) => void;
};

export class WorkerPool {
  private workers: Worker[] = [];
  private idle: Worker[] = [];
  private queue: QueueItem[] = [];
  private inFlight = new Set<QueueItem>();
  private terminated = false;

  constructor(poolSize?: number) {
    const size = poolSize ?? getDeviceProfile().workers;
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL("../workers/crypto-worker.ts", import.meta.url), {
        type: "module",
      });
      this.workers.push(worker);
      this.idle.push(worker);
    }
  }

  /** Process a chunk through the worker pipeline (encrypt for uploads, decrypt
   *  for downloads). Returns a promise of the result. */
  process<TOut extends PoolOutput = WorkerOutput>(input: PoolInput): Promise<TOut> {
    if (this.terminated) {
      return Promise.reject(new Error("Worker pool has been terminated"));
    }

    return new Promise<TOut>((resolve, reject) => {
      const item: QueueItem = { input, resolve: resolve as (o: PoolOutput) => void, reject };

      const worker = this.idle.pop();
      if (worker) {
        this.dispatch(worker, item);
      } else {
        this.queue.push(item);
      }
    });
  }

  private dispatch(worker: Worker, item: QueueItem) {
    this.inFlight.add(item);

    const release = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      this.inFlight.delete(item);
      const next = this.queue.shift();
      if (next) {
        this.dispatch(worker, next);
      } else {
        this.idle.push(worker);
      }
    };

    const onMessage = (e: MessageEvent<PoolOutput | WorkerFailure>) => {
      release();
      if ("error" in e.data) {
        item.reject(new Error(e.data.error || "Worker error"));
      } else {
        item.resolve(e.data);
      }
    };

    const onError = (e: ErrorEvent) => {
      release();
      item.reject(new Error(e.message || "Worker error"));
    };

    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);

    // Zero-copy send: transfer the data buffer this direction carries (the
    // plaintext for encrypt, the encrypted bytes for decrypt). keyBytes is NOT
    // transferred: download reuses the same key object across every chunk.
    const buffer = "encrypted" in item.input ? item.input.encrypted : item.input.plaintext;
    worker.postMessage(item.input, [buffer]);
  }

  /** Terminate all workers and reject pending items. */
  terminate() {
    this.terminated = true;
    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers = [];
    this.idle = [];
    for (const item of [...this.inFlight, ...this.queue]) {
      item.reject(new Error("Worker pool terminated"));
    }
    this.inFlight.clear();
    this.queue = [];
  }

  /** Number of workers in the pool. */
  get size(): number {
    return this.workers.length;
  }
}
