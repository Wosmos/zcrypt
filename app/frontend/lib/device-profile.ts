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

  // Network-aware adjustments
  if (isConstrainedNetwork()) {
    profile.maxConcurrentUploads = 1;
    profile.maxConcurrentDownloads = Math.min(profile.maxConcurrentDownloads, 2);
  }

  // If we know the bandwidth, further tune concurrent operations
  const downlink = getDownlinkMbps();
  if (downlink !== undefined) {
    if (downlink < 2) {
      // Very slow connection (< 2 Mbps) — serialize uploads
      profile.maxConcurrentUploads = 1;
      profile.maxConcurrentDownloads = 1;
    } else if (downlink < 10) {
      // Moderate connection — limit concurrency
      profile.maxConcurrentUploads = Math.min(profile.maxConcurrentUploads, 1);
      profile.maxConcurrentDownloads = Math.min(profile.maxConcurrentDownloads, 2);
    }
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
