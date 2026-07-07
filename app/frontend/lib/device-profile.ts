/**
 * Device-aware resource tuning.
 *
 * Detects actual hardware capabilities (CPU cores, RAM, network)
 * and returns tuned parameters for the crypto pipeline.
 *
 * Signals used (in priority order):
 *  1. navigator.deviceMemory  — RAM in GB (Chromium: 0.25/0.5/1/2/4/8)
 *  2. navigator.hardwareConcurrency — logical CPU cores (all browsers)
 *  3. navigator.connection — network speed/type (Chromium)
 *
 * Security: all detection is local-only. No values are sent to the server
 * or persisted to storage (avoids fingerprinting risk).
 */

export type DeviceTier = "low" | "medium" | "high" | "ultra";

export interface DeviceProfile {
  tier: DeviceTier;
  /** Number of Web Workers for the crypto pool */
  workers: number;
  /** Bytes per chunk (file is sliced into chunks of this size) */
  chunkSize: number;
  /** zstd compression level (1 = fast/low ratio, 3 = slower/better ratio) */
  compressionLevel: number;
  /** Max concurrent file uploads */
  maxConcurrentUploads: number;
  /** Max concurrent chunk downloads */
  maxConcurrentDownloads: number;
}

// Extend Navigator for Chromium-only APIs
interface NavigatorExtended extends Navigator {
  deviceMemory?: number;
  connection?: {
    downlink?: number;
    effectiveType?: "slow-2g" | "2g" | "3g" | "4g";
    saveData?: boolean;
  };
}

/**
 * Detect device tier from actual hardware signals.
 * Does NOT use screen size — a phone with an external monitor is still a phone.
 */
function detectTier(): DeviceTier {
  const nav = navigator as NavigatorExtended;
  const cores = nav.hardwareConcurrency || 2;
  const memory = nav.deviceMemory; // undefined on Safari/Firefox

  // If we have RAM info (Chromium), use it as primary signal — it's the
  // best indicator of how much we can load into memory simultaneously.
  if (memory !== undefined) {
    if (memory <= 1) return "low"; // ≤1GB — budget phone / very old device
    if (memory <= 2) return "medium"; // 2GB — mid phone / old tablet
    if (memory <= 4) return "high"; // 4GB — laptop / good tablet
    return "ultra"; // 8GB+ — desktop / workstation
  }

  // Fallback: core count is available everywhere.
  // Low core count strongly correlates with constrained devices.
  if (cores <= 2) return "low";
  if (cores <= 4) return "medium";
  if (cores <= 8) return "high";
  return "ultra";
}

/**
 * Check if the user has opted into data saving or is on a slow connection.
 * If so, we reduce concurrent network operations regardless of device tier.
 */
function isConstrainedNetwork(): boolean {
  const nav = navigator as NavigatorExtended;
  if (!nav.connection) return false;
  if (nav.connection.saveData) return true;
  const type = nav.connection.effectiveType;
  return type === "slow-2g" || type === "2g" || type === "3g";
}

/**
 * Get the estimated network bandwidth in Mbps, if available.
 * Returns undefined on browsers that don't support Network Information API.
 */
function getDownlinkMbps(): number | undefined {
  const nav = navigator as NavigatorExtended;
  return nav.connection?.downlink;
}

const PROFILES: Record<DeviceTier, DeviceProfile> = {
  low: {
    tier: "low",
    workers: 1,
    chunkSize: 4 * 1024 * 1024, // 4MB
    compressionLevel: 1,
    maxConcurrentUploads: 1,
    maxConcurrentDownloads: 2,
  },
  medium: {
    tier: "medium",
    workers: 2,
    chunkSize: 8 * 1024 * 1024, // 8MB
    compressionLevel: 2,
    maxConcurrentUploads: 1,
    maxConcurrentDownloads: 3,
  },
  high: {
    tier: "high",
    workers: 3,
    chunkSize: 10 * 1024 * 1024, // 10MB
    compressionLevel: 3,
    maxConcurrentUploads: 2,
    maxConcurrentDownloads: 4,
  },
  ultra: {
    tier: "ultra",
    workers: Math.min(navigator.hardwareConcurrency || 4, 6),
    chunkSize: 16 * 1024 * 1024, // 16MB
    compressionLevel: 3,
    maxConcurrentUploads: 3,
    maxConcurrentDownloads: 6,
  },
};

const TIER_ORDER: DeviceTier[] = ["low", "medium", "high", "ultra"];

// Build a profile for a tier with the worker cap + network clamps applied.
// Shared by the heuristic path (getDeviceProfile) and the measured path
// (calibrateDeviceProfile) so both post-process identically.
function buildProfile(tier: DeviceTier): DeviceProfile {
  const profile = { ...PROFILES[tier] };

  // Cap workers to actual core count (never exceed physical capability)
  const cores = navigator.hardwareConcurrency || 2;
  profile.workers = Math.min(profile.workers, cores);

  // Network-aware adjustments — clamp only on signals that reliably indicate a
  // slow link: effectiveType 2g/slow-2g/3g or saveData (isConstrainedNetwork),
  // or a downlink estimate at the very bottom of the range.
  if (isConstrainedNetwork()) {
    profile.maxConcurrentUploads = 1;
    profile.maxConcurrentDownloads = Math.min(profile.maxConcurrentDownloads, 2);
  }

  // Chromium CAPS reported downlink at 10 Mbps (anti-fingerprinting), so a
  // "downlink < 10" rule catches fast connections too and would serialize
  // uploads/downloads on gigabit links. Only trust the estimate when it reads
  // clearly slow (< 2 Mbps) — well below the cap.
  const downlink = getDownlinkMbps();
  if (downlink !== undefined && downlink < 2) {
    profile.maxConcurrentUploads = 1;
    profile.maxConcurrentDownloads = 1;
  }

  return profile;
}

// Cached profile — computed once per page load (hardware doesn't change
// mid-session), then optionally UPGRADED once by calibrateDeviceProfile().
let cached: DeviceProfile | null = null;
let calibrated = false;

/**
 * Returns the device profile for the current hardware.
 * Computed once (heuristic) and cached; calibrateDeviceProfile may upgrade it.
 */
export function getDeviceProfile(): DeviceProfile {
  if (cached) return cached;
  cached = buildProfile(detectTier());
  return cached;
}

/**
 * Map measured crypto throughput (MB/s of AES-GCM + SHA-256 over the bench
 * buffer) to a tier. Thresholds are intentionally generous: this only ever
 * UPGRADES the heuristic tier, so a strong device that the heuristic under-rated
 * (notably iPhones — Safari doesn't expose navigator.deviceMemory, so they fall
 * back to the core-count guess) gets the profile its hardware can actually run.
 */
export function tierFromThroughput(mbps: number): DeviceTier {
  if (mbps >= 400) return "ultra";
  if (mbps >= 180) return "high";
  if (mbps >= 70) return "medium";
  return "low";
}

/**
 * Measure real crypto throughput: encrypt + hash a fixed buffer a few times and
 * report MB/s. AES-GCM/SHA run off the main thread inside Web Crypto, so this
 * doesn't jank the UI. Returns null if Web Crypto is unavailable or it throws.
 */
async function measureCryptoThroughput(): Promise<number | null> {
  if (typeof crypto === "undefined" || !crypto.subtle || typeof performance === "undefined") {
    return null;
  }
  try {
    const SIZE = 2 * 1024 * 1024; // 2MB
    const ITERS = 4; // ~8MB of work total
    const data = new Uint8Array(SIZE);
    crypto.getRandomValues(data.subarray(0, 65536)); // seed a little; timing is data-independent
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt"]);
    const iv = new Uint8Array(12);
    const start = performance.now();
    for (let i = 0; i < ITERS; i++) {
      const enc = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data as BufferSource);
      await crypto.subtle.digest("SHA-256", enc);
    }
    const elapsedSec = (performance.now() - start) / 1000;
    if (elapsedSec <= 0) return null;
    return (SIZE * ITERS) / (1024 * 1024) / elapsedSec;
  } catch {
    return null;
  }
}

/**
 * One-time capability calibration. Runs a crypto micro-benchmark and, if the
 * device measures FASTER than the heuristic guessed, upgrades the cached profile
 * to the measured tier (bigger chunks, more workers, better compression). Only
 * ever upgrades — the RAM/core heuristic stays a floor, so a noisy or throttled
 * benchmark can never make a good device worse. Idempotent and fire-and-forget:
 * call once at app start. `measure` is injectable for tests.
 *
 * Safe to run alongside uploads: chunk size increasing only affects NEW uploads
 * (a resumed session reads its own persisted chunk size), and worker count is
 * read per operation.
 */
export async function calibrateDeviceProfile(
  measure: () => Promise<number | null> = measureCryptoThroughput
): Promise<DeviceProfile> {
  const base = getDeviceProfile();
  if (calibrated) return cached as DeviceProfile;
  calibrated = true;

  const mbps = await measure();
  if (mbps != null) {
    const measuredTier = tierFromThroughput(mbps);
    if (TIER_ORDER.indexOf(measuredTier) > TIER_ORDER.indexOf(base.tier)) {
      cached = buildProfile(measuredTier);
    }
  }
  return cached as DeviceProfile;
}

/**
 * Returns the chunk size for the current device.
 * Use this instead of the hardcoded CHUNK_SIZE constant.
 */
export function getChunkSize(): number {
  return getDeviceProfile().chunkSize;
}

/**
 * Recommended number of PARALLEL FILE uploads for a batch.
 *
 * Deliberately DECOUPLED from the CPU tier (`maxConcurrentUploads`, which stays
 * for the crypto worker pool): upload throughput is network-bound, not CPU-
 * bound — a 4 MB photo barely touches the CPU, and the real win of parallelism
 * is amortizing each file's fixed init/complete round-trips. Tying file
 * concurrency to CPU/RAM made phones upload ~1-2 at a time even on fast Wi-Fi.
 *
 * Driven by the batch's TYPICAL (median) file size, not the largest — one big
 * file in a 100-photo batch must not serialize the other 99 (the old "every
 * file must be small" rule did exactly that):
 *   - median small (≤16 MB)  → fan out wide (6)
 *   - median large (≥100 MB) → keep it lean (2): bandwidth + memory
 *   - in between             → moderate (4)
 * Slow / data-saver links serialize regardless (parallel streams only contend).
 *
 * The server enforces its own limits (per-user cap when set + a global chunk
 * semaphore), so the caller still clamps this to any server-provided cap. The
 * ceiling of 6 stays within that global chunk budget for a single active user.
 */
export function recommendedUploadConcurrency(fileSizes: number[]): number {
  if (fileSizes.length === 0) return 1;
  if (isConstrainedNetwork()) return 1;

  const sorted = [...fileSizes].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const SMALL = 16 * 1024 * 1024; // ≤16MB typical → small-file batch
  const LARGE = 100 * 1024 * 1024; // ≥100MB typical → heavy batch

  let want = median <= SMALL ? 6 : median >= LARGE ? 2 : 4;

  // A very slow link (well below Chromium's 10 Mbps anti-fingerprint cap):
  // serialize so the single stream gets all the uplink.
  const downlink = getDownlinkMbps();
  if (downlink !== undefined && downlink < 2) want = 1;

  // Never exceed the number of files in the batch.
  return Math.max(1, Math.min(want, fileSizes.length));
}
