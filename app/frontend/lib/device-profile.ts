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

// Cached profile — computed once per page load (hardware doesn't change mid-session)
let cached: DeviceProfile | null = null;

/**
 * Returns the device profile for the current hardware.
 * Computed once and cached for the session.
 */
export function getDeviceProfile(): DeviceProfile {
  if (cached) return cached;

  const tier = detectTier();
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
    // Very slow connection (< 2 Mbps) — serialize transfers
    profile.maxConcurrentUploads = 1;
    profile.maxConcurrentDownloads = 1;
  }

  cached = profile;
  return profile;
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
