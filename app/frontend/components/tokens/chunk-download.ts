import { retryTransient } from "@/lib/retry";
import { OrderedWriter } from "@/lib/ordered-writer";
import { isAbortError } from "@/lib/transport";
import type { Progress } from "./use-token-viewer";

type Options = {
  count: number;
  concurrency: number;
  setProgress: (p: Progress) => void;
  stageLabel: (done: number, total: number) => string;
  fetchChunk: (index: number, signal: AbortSignal) => Promise<Uint8Array>;
  /** Caller cancel: aborts in-flight chunks and rejects with an AbortError. */
  signal?: AbortSignal;
  /** Streams chunks in index order here instead of keeping them in memory. */
  sink?: (data: Uint8Array) => Promise<void>;
};

/**
 * Fetch every chunk of a link download with bounded concurrency, each under the
 * shared retry rule. The first chunk that runs out of retries stops the other
 * workers and their in-flight requests, and its error is the one thrown.
 */
export async function downloadChunks({
  count,
  concurrency,
  setProgress,
  stageLabel,
  fetchChunk,
  signal,
  sink,
}: Options): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = sink ? [] : new Array(count);
  const writer = sink
    ? new OrderedWriter({ write: sink }, Math.max(4, concurrency * 2))
    : undefined;
  let done = 0;
  const queue = Array.from({ length: count }, (_, i) => i);
  const failCtl = new AbortController();
  const runSignal = signal ? AbortSignal.any([signal, failCtl.signal]) : failCtl.signal;
  let failure: { reason: unknown } | undefined;

  const worker = async () => {
    while (queue.length > 0 && !runSignal.aborted) {
      const index = queue.shift()!;
      try {
        const plain = await retryTransient(() => fetchChunk(index, runSignal), {
          signal: runSignal,
        });
        if (writer) await writer.put(index, plain, runSignal);
        else chunks[index] = plain;
      } catch (err) {
        if (!signal?.aborted && !failure) {
          failure = { reason: err };
          failCtl.abort();
        }
        throw err;
      }
      done++;
      setProgress({
        stage: stageLabel(done, count),
        percent: 2 + Math.round((done / count) * 90),
      });
    }
  };

  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, count) }, worker),
  );
  if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  if (failure) throw failure.reason;
  const rejected = settled.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (rejected && !isAbortError(rejected.reason)) throw rejected.reason;
  await writer?.close(count);
  return chunks;
}
