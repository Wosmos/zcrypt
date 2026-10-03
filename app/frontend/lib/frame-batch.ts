/**
 * Coalesces per-id updates into one flush per animation frame: the last write
 * for an id within a frame wins. `drop` purges a queued write, so a direct
 * terminal-status write is never stomped by a frame that lands after it.
 */
export function createFrameBatch<U>(flush: (updates: Map<string, U>) => void) {
  const pending = new Map<string, U>();
  let scheduled = false;
  return {
    queue(id: string, update: U) {
      pending.set(id, update);
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        if (pending.size === 0) return;
        const updates = new Map(pending);
        pending.clear();
        flush(updates);
      });
    },
    drop(id: string) {
      pending.delete(id);
    },
  };
}
