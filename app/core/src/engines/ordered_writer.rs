//! Bounded reorder buffer for streaming downloads — the Rust port of the web
//! client's `lib/ordered-writer.ts`. Chunks finish out of order; the sink must
//! receive them strictly by index without ever buffering the whole file.
//!
//! Design: workers send `(index, bytes)` over a bounded mpsc channel; `drain`
//! holds a small BTreeMap of early arrivals and flushes every contiguous run to
//! the sink. Memory is bounded by (channel capacity + concurrent workers)
//! chunks, independent of file size.

use std::collections::BTreeMap;

use tokio::sync::mpsc;

use super::EngineError;

/// Drains `(index, data)` messages, delivering to `sink` strictly in index
/// order starting at `start_at`. Returns the number of chunks written. Ends
/// when every sender is dropped; errors if a gap remains (a chunk never
/// arrived) so a truncated file is never finalized.
///
/// The sink is synchronous (a buffered file write) — chunk-sized sequential
/// writes are fast enough that blocking the drain task briefly is the simpler
/// and correct trade against an async-closure borrow tangle.
pub async fn drain<S>(
    mut rx: mpsc::Receiver<(u32, Vec<u8>)>,
    start_at: u32,
    expected: u32,
    mut sink: S,
) -> Result<u32, EngineError>
where
    S: FnMut(Vec<u8>) -> Result<(), EngineError>,
{
    let mut buffer: BTreeMap<u32, Vec<u8>> = BTreeMap::new();
    let mut cursor = start_at;

    while let Some((idx, data)) = rx.recv().await {
        buffer.insert(idx, data);
        while let Some(data) = buffer.remove(&cursor) {
            sink(data)?;
            cursor += 1;
        }
    }

    if cursor != expected {
        return Err(EngineError::Integrity(format!(
            "incomplete download: wrote {cursor}/{expected} chunks"
        )));
    }
    Ok(cursor - start_at)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    type Collected = Arc<Mutex<Vec<u8>>>;

    fn collector() -> (Collected, impl FnMut(Vec<u8>) -> Result<(), EngineError>) {
        let seen: Collected = Arc::new(Mutex::new(Vec::new()));
        let s = seen.clone();
        let sink = move |d: Vec<u8>| {
            s.lock().unwrap().push(d[0]);
            Ok(())
        };
        (seen, sink)
    }

    #[tokio::test]
    async fn jumbled_arrivals_deliver_in_order() {
        let (tx, rx) = mpsc::channel(4);
        let (seen, sink) = collector();
        let writer = tokio::spawn(drain(rx, 0, 5, sink));
        for i in [2u32, 0, 1, 4, 3] {
            tx.send((i, vec![i as u8])).await.unwrap();
        }
        drop(tx);
        assert_eq!(writer.await.unwrap().unwrap(), 5);
        assert_eq!(*seen.lock().unwrap(), vec![0, 1, 2, 3, 4]);
    }

    #[tokio::test]
    async fn resume_starts_at_high_water_mark() {
        let (tx, rx) = mpsc::channel(4);
        let (seen, sink) = collector();
        let writer = tokio::spawn(drain(rx, 3, 5, sink));
        tx.send((4, vec![4])).await.unwrap();
        tx.send((3, vec![3])).await.unwrap();
        drop(tx);
        assert_eq!(writer.await.unwrap().unwrap(), 2);
        assert_eq!(*seen.lock().unwrap(), vec![3, 4]);
    }

    #[tokio::test]
    async fn gap_fails_instead_of_truncating() {
        let (tx, rx) = mpsc::channel(4);
        let (_seen, sink) = collector();
        let writer = tokio::spawn(drain(rx, 0, 3, sink));
        tx.send((0, vec![0])).await.unwrap();
        tx.send((2, vec![2])).await.unwrap(); // gap at 1
        drop(tx);
        let err = writer.await.unwrap().unwrap_err();
        assert!(err.to_string().contains("incomplete"));
    }
}
