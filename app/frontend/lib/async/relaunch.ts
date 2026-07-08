/**
 * Run `run()` only AFTER an optional prior run settles, swallowing whatever the
 * prior rejected with (a paused/aborted run rejects, and that's fine). This is
 * the "never race a still-draining previous run over the same item" idiom copied
 * across the upload and download stores' resume/retry/auto-resume paths.
 *
 * Fire-and-forget: it schedules the work and returns immediately.
 */
export function relaunchAfterPrior(
  prior: Promise<unknown> | undefined,
  run: () => Promise<void>
): void {
  void (async () => {
    try {
      await prior;
    } catch {
      /* previous run settled (paused / aborted / errored) — fine */
    }
    await run();
  })();
}
