/**
 * A minimal counting semaphore — `acquire()` resolves when a slot is free,
 * `release()` frees one and wakes the next waiter (FIFO). Folds the count +
 * waiters limiter reimplemented three times in store/upload.ts (batch file
 * concurrency, pipeline depth, upload slots).
 */
export interface Semaphore {
  acquire(): Promise<void>;
  release(): void;
}

export function createSemaphore(max: number): Semaphore {
  let running = 0;
  const waiters: (() => void)[] = [];

  return {
    acquire(): Promise<void> {
      if (running < max) {
        running++;
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => waiters.push(resolve));
    },
    release(): void {
      running--;
      const next = waiters.shift();
      if (next) {
        running++;
        next();
      }
    },
  };
}
