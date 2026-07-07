/**
 * Fire a short device vibration if the platform supports it (Android Chrome).
 * iOS Safari has no Vibration API, so this is a graceful no-op there — callers
 * treat haptics as pure polish and never depend on it. Never throws: some
 * engines reject vibrate() when called from a background tab or too rapidly.
 */
export function haptic(durationMs = 8): void {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(durationMs);
    }
  } catch {
    /* vibration unavailable / rate-limited — ignore */
  }
}
