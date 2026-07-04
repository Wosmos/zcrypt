/**
 * Reorder buffer for streaming a download to disk.
 *
 * Chunks are fetched + decrypted concurrently (out of order), but a file must be
 * written in order (chunk 0, then 1, ...). OrderedWriter accepts chunks in ANY
 * order and delivers them to `sink` strictly in index order, bounded in memory
 * so a slow early chunk can't make the whole file pile up in RAM. This is what
 * lets a 25GB download stream to disk instead of being assembled in memory.
 */

export interface ChunkSink {
  /** Write one chunk's bytes. Called strictly in index order. */
  write(data: Uint8Array): Promise<void>;
}

export class OrderedWriter {
  private buffer = new Map<number, Uint8Array>();
  private cursor: number;
  // Serialize flushes via a promise chain so concurrent put()s can't interleave
  // writes or race the cursor (JS is single-threaded but flush awaits I/O).
  private lock: Promise<void> = Promise.resolve();
  private readonly maxBuffer: number;

  /** `startAt` lets a RESUMED download begin at the high-water mark of a paused
   *  run: chunks 0..startAt-1 are already on disk (and already hashed), so the
   *  fresh writer's cursor starts there and the first chunk it expects is
   *  `startAt`, not 0. */
  constructor(private sink: ChunkSink, maxBuffer = 8, startAt = 0) {
    this.maxBuffer = Math.max(1, maxBuffer);
    this.cursor = startAt;
  }

  /**
   * Hand a decrypted chunk to the writer. Resolves once it's been buffered and
   * any now-contiguous run has been flushed to the sink. Applies backpressure:
   * if the reorder buffer is full it waits — unless this chunk is the one the
   * cursor is waiting for, which is always accepted so it can never deadlock.
   *
   * `signal` breaks the backpressure wait on pause/cancel: without it, a put
   * for a high index parked behind a missing low index (whose fetch was just
   * aborted) would spin forever, hanging the pause. Aborting throws so the
   * chunk is simply re-fetched on resume (it's ahead of the cursor anyway).
   */
  async put(index: number, data: Uint8Array, signal?: AbortSignal): Promise<void> {
    while (
      this.buffer.size >= this.maxBuffer &&
      index !== this.cursor &&
      !this.buffer.has(this.cursor)
    ) {
      if (signal?.aborted) throw new DOMException("Download aborted", "AbortError");
      await new Promise((r) => setTimeout(r, 15));
    }
    this.buffer.set(index, data);
    await this.flush();
  }

  private flush(): Promise<void> {
    this.lock = this.lock.then(() => this.drain());
    return this.lock;
  }

  private async drain(): Promise<void> {
    while (this.buffer.has(this.cursor)) {
      const d = this.buffer.get(this.cursor)!;
      this.buffer.delete(this.cursor);
      await this.sink.write(d);
      this.cursor++;
    }
  }

  /** Number of chunks written to the sink so far (in order). */
  get written(): number {
    return this.cursor;
  }

  /**
   * Drain the last contiguous run and assert the whole file was written. Throws
   * if a gap remains (a chunk never arrived) so we never finalize a truncated
   * file on disk.
   */
  async close(expectedCount: number): Promise<void> {
    await this.flush();
    if (this.cursor !== expectedCount) {
      throw new Error(`incomplete download: wrote ${this.cursor}/${expectedCount} chunks`);
    }
  }
}
