import { describe, it, expect, beforeEach, vi } from "vitest";

// getDeviceProfile() memoizes into a module-level `cached` variable and the
// "ultra" tier's default worker count is baked into a module-level PROFILES
// object at import time (from navigator.hardwareConcurrency). Both mean every
// scenario needs navigator set up *before* a fresh module instance is loaded.
interface NavOverrides {
  hardwareConcurrency?: number;
  deviceMemory?: number;
  connection?: { downlink?: number; effectiveType?: "slow-2g" | "2g" | "3g" | "4g"; saveData?: boolean };
}

function setNav({ hardwareConcurrency = 8, deviceMemory, connection }: NavOverrides) {
  Object.defineProperty(navigator, "hardwareConcurrency", {
    value: hardwareConcurrency,
    configurable: true,
  });
  const nav = navigator as unknown as Record<string, unknown>;
  if (deviceMemory === undefined) {
    delete nav.deviceMemory;
  } else {
    Object.defineProperty(navigator, "deviceMemory", { value: deviceMemory, configurable: true });
  }
  if (connection === undefined) {
    delete nav.connection;
  } else {
    Object.defineProperty(navigator, "connection", { value: connection, configurable: true });
  }
}

async function loadProfile(overrides: NavOverrides) {
  setNav(overrides);
  return import("@/lib/device-profile");
}

beforeEach(() => {
  vi.resetModules();
});

describe("getDeviceProfile — tier detection via deviceMemory", () => {
  it.each([
    [0.5, "low"],
    [1, "low"],
    [2, "medium"],
    [4, "high"],
    [8, "ultra"],
  ] as const)("deviceMemory=%s -> tier %s", async (memory, tier) => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: memory, hardwareConcurrency: 8 });
    expect(getDeviceProfile().tier).toBe(tier);
  });
});

describe("getDeviceProfile — tier detection via hardwareConcurrency fallback (no deviceMemory)", () => {
  it.each([
    [0, "low"], // falsy -> defaults to 2 cores
    [2, "low"],
    [4, "medium"],
    [8, "high"],
    [16, "ultra"],
  ] as const)("cores=%s -> tier %s", async (cores, tier) => {
    const { getDeviceProfile } = await loadProfile({ hardwareConcurrency: cores });
    expect(getDeviceProfile().tier).toBe(tier);
  });
});

describe("getDeviceProfile — worker cap", () => {
  it("caps workers to the actual core count even when memory implies more", async () => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: 4, hardwareConcurrency: 2 });
    const profile = getDeviceProfile();
    expect(profile.tier).toBe("high"); // PROFILES.high.workers = 3
    expect(profile.workers).toBe(2); // capped to the 2 available cores
  });

  it("ultra tier: worker count is derived from cores at module load, then capped again", async () => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: 8, hardwareConcurrency: 16 });
    const profile = getDeviceProfile();
    expect(profile.workers).toBe(6); // min(16, 6) = 6, cap min(6, 16) = 6
  });

  it("ultra tier falls back to 4 workers when hardwareConcurrency is falsy", async () => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: 8, hardwareConcurrency: 0 });
    const profile = getDeviceProfile();
    // PROFILES.ultra.workers = min(0||4, 6) = 4; cap cores = 0||2 = 2 -> min(4,2) = 2
    expect(profile.workers).toBe(2);
  });
});

describe("getDeviceProfile — network awareness", () => {
  it("no connection info leaves concurrency at tier defaults", async () => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: 4 });
    const profile = getDeviceProfile();
    expect(profile.maxConcurrentUploads).toBe(2);
    expect(profile.maxConcurrentDownloads).toBe(4);
  });

  it("saveData constrains uploads to 1 and caps downloads at 2", async () => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: 4, connection: { saveData: true } });
    const profile = getDeviceProfile();
    expect(profile.maxConcurrentUploads).toBe(1);
    expect(profile.maxConcurrentDownloads).toBe(2);
  });

  it.each(["slow-2g", "2g", "3g"] as const)("effectiveType=%s constrains the network", async (effectiveType) => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: 4, connection: { effectiveType } });
    const profile = getDeviceProfile();
    expect(profile.maxConcurrentUploads).toBe(1);
  });

  it("effectiveType=4g does not constrain the network", async () => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: 4, connection: { effectiveType: "4g" } });
    const profile = getDeviceProfile();
    expect(profile.maxConcurrentUploads).toBe(2);
  });

  it("downlink below 2 Mbps fully serializes transfers", async () => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: 4, connection: { downlink: 1.5 } });
    const profile = getDeviceProfile();
    expect(profile.maxConcurrentUploads).toBe(1);
    expect(profile.maxConcurrentDownloads).toBe(1);
  });

  it("downlink at or above 2 Mbps does not serialize transfers", async () => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: 4, connection: { downlink: 5 } });
    const profile = getDeviceProfile();
    expect(profile.maxConcurrentUploads).toBe(2);
    expect(profile.maxConcurrentDownloads).toBe(4);
  });

  it("connection present without a downlink field skips the downlink check", async () => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: 4, connection: { effectiveType: "4g" } });
    const profile = getDeviceProfile();
    expect(profile.maxConcurrentDownloads).toBe(4);
  });
});

describe("getDeviceProfile — caching", () => {
  it("computes once per module instance and returns the same object on subsequent calls", async () => {
    const { getDeviceProfile } = await loadProfile({ deviceMemory: 4 });
    const first = getDeviceProfile();
    const second = getDeviceProfile();
    expect(second).toBe(first);
  });
});

describe("recommendedUploadConcurrency — network-bound, decoupled from CPU tier", () => {
  const MB = 1024 * 1024;

  it("fans a small-file batch out to 6 regardless of a weak CPU tier", async () => {
    // deviceMemory:1 → 'low' tier (maxConcurrentUploads:1). Upload concurrency
    // must NOT inherit that — a batch of small photos should still fan out wide.
    const { recommendedUploadConcurrency } = await loadProfile({ deviceMemory: 1 });
    const sizes = Array.from({ length: 20 }, () => 4 * MB); // 20 × 4MB photos
    expect(recommendedUploadConcurrency(sizes)).toBe(6);
  });

  it("keeps a heavy (median ≥100MB) batch lean at 2", async () => {
    const { recommendedUploadConcurrency } = await loadProfile({ deviceMemory: 8 });
    const sizes = Array.from({ length: 5 }, () => 150 * MB);
    expect(recommendedUploadConcurrency(sizes)).toBe(2);
  });

  it("uses a moderate 4 for a mid-size (16MB–100MB median) batch", async () => {
    const { recommendedUploadConcurrency } = await loadProfile({ deviceMemory: 8 });
    const sizes = Array.from({ length: 8 }, () => 50 * MB);
    expect(recommendedUploadConcurrency(sizes)).toBe(4);
  });

  it("decides by the MEDIAN, so a few big files don't serialize a mostly-small batch", async () => {
    const { recommendedUploadConcurrency } = await loadProfile({ deviceMemory: 4 });
    // 98 small photos + 2 huge files → median is small → still fans out to 6
    // (the old "every file must be small" rule would have dropped this to 1-2).
    const sizes = [...Array.from({ length: 98 }, () => 4 * MB), 500 * MB, 800 * MB];
    expect(recommendedUploadConcurrency(sizes)).toBe(6);
  });

  it("serializes on a data-saver / slow (2g/3g) connection", async () => {
    const { recommendedUploadConcurrency } = await loadProfile({
      deviceMemory: 8,
      connection: { effectiveType: "3g" },
    });
    expect(recommendedUploadConcurrency(Array.from({ length: 20 }, () => 4 * MB))).toBe(1);
  });

  it("serializes when the downlink estimate is very slow (<2 Mbps)", async () => {
    const { recommendedUploadConcurrency } = await loadProfile({
      deviceMemory: 8,
      connection: { downlink: 1.2 },
    });
    expect(recommendedUploadConcurrency(Array.from({ length: 10 }, () => 4 * MB))).toBe(1);
  });

  it("never exceeds the number of files in the batch, and is 1 for an empty batch", async () => {
    const { recommendedUploadConcurrency } = await loadProfile({ deviceMemory: 8 });
    expect(recommendedUploadConcurrency([])).toBe(1);
    expect(recommendedUploadConcurrency([4 * MB])).toBe(1);
    expect(recommendedUploadConcurrency([4 * MB, 4 * MB, 4 * MB])).toBe(3);
  });
});

describe("tierFromThroughput", () => {
  it("maps measured MB/s to tiers at the documented thresholds", async () => {
    const { tierFromThroughput } = await loadProfile({ deviceMemory: 4 });
    expect(tierFromThroughput(30)).toBe("low");
    expect(tierFromThroughput(69)).toBe("low");
    expect(tierFromThroughput(70)).toBe("medium");
    expect(tierFromThroughput(179)).toBe("medium");
    expect(tierFromThroughput(180)).toBe("high");
    expect(tierFromThroughput(399)).toBe("high");
    expect(tierFromThroughput(400)).toBe("ultra");
    expect(tierFromThroughput(5000)).toBe("ultra");
  });
});

describe("calibrateDeviceProfile — measured capability upgrades (never downgrades) the tier", () => {
  it("upgrades an under-detected device (e.g. iPhone: no deviceMemory, few cores) when it benchmarks fast", async () => {
    // deviceMemory undefined + 2 cores → heuristic 'low'. A fast benchmark
    // (ultra throughput) should upgrade it — the exact iPhone-under-detection fix.
    const { getDeviceProfile, calibrateDeviceProfile } = await loadProfile({ hardwareConcurrency: 2 });
    expect(getDeviceProfile().tier).toBe("low");

    const upgraded = await calibrateDeviceProfile(async () => 500); // ultra-class MB/s
    expect(upgraded.tier).toBe("ultra");
    expect(getDeviceProfile().tier).toBe("ultra"); // cache updated in place
    expect(getDeviceProfile().chunkSize).toBe(16 * 1024 * 1024);
  });

  it("never downgrades a device the heuristic already rated highly", async () => {
    // deviceMemory 8 → 'ultra'. A slow/throttled benchmark must NOT drop it.
    const { getDeviceProfile, calibrateDeviceProfile } = await loadProfile({ deviceMemory: 8 });
    expect(getDeviceProfile().tier).toBe("ultra");

    const after = await calibrateDeviceProfile(async () => 50); // low-class MB/s
    expect(after.tier).toBe("ultra");
  });

  it("leaves the heuristic profile untouched when the benchmark is unavailable (null)", async () => {
    const { getDeviceProfile, calibrateDeviceProfile } = await loadProfile({ deviceMemory: 2 });
    expect(getDeviceProfile().tier).toBe("medium");
    const after = await calibrateDeviceProfile(async () => null);
    expect(after.tier).toBe("medium");
  });

  it("is idempotent — only measures once", async () => {
    const { calibrateDeviceProfile } = await loadProfile({ hardwareConcurrency: 2 });
    const measure = vi.fn(async () => 500);
    await calibrateDeviceProfile(measure);
    await calibrateDeviceProfile(measure);
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("still honors a slow-network clamp after an upgrade (upload stays serialized)", async () => {
    const { calibrateDeviceProfile } = await loadProfile({
      hardwareConcurrency: 2,
      connection: { effectiveType: "3g" },
    });
    const upgraded = await calibrateDeviceProfile(async () => 500);
    expect(upgraded.tier).toBe("ultra");
    expect(upgraded.maxConcurrentUploads).toBe(1); // network clamp preserved via buildProfile
  });
});

describe("getChunkSize", () => {
  it("returns the chunk size for the low tier", async () => {
    const { getChunkSize } = await loadProfile({ deviceMemory: 1 });
    expect(getChunkSize()).toBe(4 * 1024 * 1024);
  });

  it("reflects the ultra tier's larger chunk size", async () => {
    const { getChunkSize } = await loadProfile({ deviceMemory: 8 });
    expect(getChunkSize()).toBe(16 * 1024 * 1024);
  });
});
