import { retryTransient } from "@/lib/retry";
import type { Progress } from "./use-token-viewer";

type Options = {
  count: number;
  concurrency: number;
  setProgress: (p: Progress) => void;
  stageLabel: (done: number, total: number) => string;
  fetchChunk: (index: number) => Promise<Uint8Array>;
};

export async function downloadChunks({
  count,
  concurrency,
  setProgress,
  stageLabel,
  fetchChunk,
}: Options): Promise<Uint8Array[]> {
  const chunks: Uint8Array[] = new Array(count);
  let done = 0;
  const queue = Array.from({ length: count }, (_, i) => i);
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(concurrency, count); w++) {
    workers.push(
      (async () => {
        while (queue.length > 0) {
          const index = queue.shift()!;
          // A busy server (429), a 5xx or a network blip on one chunk waits and
          // tries again instead of failing a large shared download.
          chunks[index] = await retryTransient(() => fetchChunk(index));
          done++;
          setProgress({
            stage: stageLabel(done, count),
            percent: 2 + Math.round((done / count) * 90),
          });
        }
      })(),
    );
  }
  await Promise.all(workers);
  return chunks;
}
