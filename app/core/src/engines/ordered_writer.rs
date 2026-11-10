//! Bounded reorder buffer for streaming downloads: the Rust port of the web
//! client's `lib/ordered-writer.ts`. Chunks finish out of order; the sink must
//! receive them strictly by index without ever buffering the whole file.
//!
//! Design: workers send `(index, bytes)` over a bounded mpsc channel; `drain`
//! holds a small BTreeMap of early arrivals and flushes every contiguous run to
//! the sink. Memory is bounded by (channel capacity + concurrent workers)
//! chunks, independent of file size.

use std::collections::BTreeMap;
use std::future::Future;
use std::sync::Arc;

use tokio::sync::{mpsc, watch, Semaphore};
use tokio::task::JoinSet;

use super::EngineError;

/// Drains `(index, data)` messages, delivering to `sink` strictly in index
/// order starting at `start_at`. Returns the number of chunks written. Ends
/// when every sender is dropped; errors if a gap remains (a chunk never
/// arrived) so a truncated file is never finalized.
///
/// The sink is synchronous (a buffered file write), chunk-sized sequential
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

const WRITER_GONE: &str = "writer gone";

#[derive(Default)]
struct Progress {
    written: u32,
    stop: bool,
}

/// Fetches chunks `0..total` and hands them to `sink` strictly in order, with
/// at most `concurrency` fetches running and at most `window` chunks fetched
/// ahead of what the sink has written, so memory stays bounded however large
/// the file. Scheduling and writing run together: a fetch never waits on a
/// writer that hasn't started (waiting on it used to hang every file larger
/// than about three times `concurrency` chunks). Scheduling stops once
/// `cancelled()` is true. A fetch's own error wins over the sink's.
pub async fn fetch_in_order<F, Fut, S>(
    total: u32,
    concurrency: usize,
    window: u32,
    cancelled: impl Fn() -> bool,
    fetch: F,
    mut sink: S,
) -> Result<(), EngineError>
where
    F: Fn(u32) -> Fut,
    Fut: Future<Output = Result<Vec<u8>, EngineError>> + Send + 'static,
    S: FnMut(Vec<u8>) -> Result<(), EngineError>,
{
    let concurrency = concurrency.max(1);
    let window = window.max(concurrency as u32);
    let (tx, rx) = mpsc::channel::<(u32, Vec<u8>)>(window as usize);
    let sem = Arc::new(Semaphore::new(concurrency));
    // How far the sink has got, and whether to stop scheduling: a fetch failed
    // (its chunk will never arrive, so the window would never move again) or
    // the sink finished.
    let progress = Arc::new(watch::channel(Progress::default()).0);
    let mut fetchers: JoinSet<Result<(), EngineError>> = JoinSet::new();

    let schedule = async {
        let tx = tx;
        for idx in 0..total {
            if cancelled() {
                break;
            }
            let mut seen = progress.subscribe();
            let open = seen
                .wait_for(|p| p.stop || idx < p.written + window)
                .await
                .map(|p| !p.stop)
                .unwrap_or(false);
            if !open {
                break;
            }
            let Ok(permit) = sem.clone().acquire_owned().await else {
                break;
            };
            let tx = tx.clone();
            let chunk = fetch(idx);
            let progress = progress.clone();
            fetchers.spawn(async move {
                let _permit = permit;
                let data = match chunk.await {
                    Ok(data) => data,
                    Err(e) => {
                        progress.send_modify(|p| p.stop = true);
                        return Err(e);
                    }
                };
                tx.send((idx, data))
                    .await
                    .map_err(|_| EngineError::Other(WRITER_GONE.into()))
            });
        }
    };
    let write = async {
        let mut written = 0u32;
        let result = drain(rx, 0, total, |data| {
            sink(data)?;
            written += 1;
            progress.send_modify(|p| p.written = written);
            Ok(())
        })
        .await;
        progress.send_modify(|p| p.stop = true);
        result
    };
    let ((), written) = tokio::join!(schedule, write);

    let mut fetch_err: Option<EngineError> = None;
    while let Some(res) = fetchers.join_next().await {
        let res = res.unwrap_or_else(|e| Err(EngineError::Other(format!("join: {e}"))));
        if let Err(e) = res {
            let gone = matches!(&e, EngineError::Other(m) if m == WRITER_GONE);
            if fetch_err.is_none() && !gone {
                fetch_err = Some(e);
            }
        }
    }
    match (fetch_err, written) {
        (Some(e), _) => Err(e),
        (None, Err(e)) => Err(e),
        (None, Ok(_)) => Ok(()),
    }
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

    async fn run(
        total: u32,
        concurrency: usize,
        window: u32,
        slow_first: bool,
    ) -> (Result<(), EngineError>, Vec<u8>, usize) {
        let (seen, mut sink) = collector();
        let fetched = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let max_ahead = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let written = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let (f, m, w) = (fetched.clone(), max_ahead.clone(), written.clone());
        let result = tokio::time::timeout(
            std::time::Duration::from_secs(10),
            fetch_in_order(
                total,
                concurrency,
                window,
                || false,
                move |idx| {
                    let ahead = f.fetch_add(1, std::sync::atomic::Ordering::SeqCst) + 1
                        - w.load(std::sync::atomic::Ordering::SeqCst);
                    m.fetch_max(ahead, std::sync::atomic::Ordering::SeqCst);
                    async move {
                        let wait = if slow_first && idx == 0 {
                            50
                        } else {
                            (idx % 3) as u64
                        };
                        tokio::time::sleep(std::time::Duration::from_millis(wait)).await;
                        Ok(vec![idx as u8])
                    }
                },
                move |d| {
                    written.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                    sink(d)
                },
            ),
        )
        .await
        .expect("fetch_in_order hung");
        let order = seen.lock().unwrap().clone();
        (
            result,
            order,
            max_ahead.load(std::sync::atomic::Ordering::SeqCst),
        )
    }

    #[tokio::test]
    async fn many_more_chunks_than_slots_finish_in_order() {
        let (result, order, _) = run(200, 2, 6, false).await;
        result.unwrap();
        assert_eq!(order, (0..200u32).map(|i| i as u8).collect::<Vec<_>>());
    }

    #[tokio::test]
    async fn a_slow_chunk_never_lets_fetching_run_past_the_window() {
        let (result, order, max_ahead) = run(60, 4, 8, true).await;
        result.unwrap();
        assert_eq!(order.len(), 60);
        assert!(
            max_ahead <= 8,
            "fetched {max_ahead} chunks ahead of the writer"
        );
    }

    #[tokio::test]
    async fn a_fetch_error_wins_and_stops_the_rest() {
        let (_seen, sink) = collector();
        let err = fetch_in_order(
            50,
            2,
            4,
            || false,
            |idx| async move {
                if idx == 3 {
                    Err(EngineError::Integrity("bad chunk".into()))
                } else {
                    Ok(vec![idx as u8])
                }
            },
            sink,
        )
        .await
        .unwrap_err();
        assert!(err.to_string().contains("bad chunk"), "{err}");
    }

    #[tokio::test]
    async fn a_sink_error_is_reported_over_writer_gone() {
        let err = fetch_in_order(
            30,
            2,
            4,
            || false,
            |idx| async move { Ok(vec![idx as u8]) },
            |_d| Err(EngineError::Other("disk full".into())),
        )
        .await
        .unwrap_err();
        assert!(err.to_string().contains("disk full"), "{err}");
    }

    #[tokio::test]
    async fn cancelling_stops_scheduling() {
        let (_seen, sink) = collector();
        let err = fetch_in_order(
            10,
            2,
            4,
            || true,
            |idx| async move { Ok(vec![idx as u8]) },
            sink,
        )
        .await
        .unwrap_err();
        assert!(err.to_string().contains("incomplete"), "{err}");
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
