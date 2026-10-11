import type { PlatformStatus, RepoInfo } from "@/types";

export interface PlatformUsage {
  platform: string;
  bytes: number;
  share: number;
  connected: boolean;
}

export function platformUsage(repos: RepoInfo[], statuses: PlatformStatus[]): PlatformUsage[] {
  const bytes = new Map<string, number>();
  for (const repo of repos) {
    bytes.set(repo.platform, (bytes.get(repo.platform) ?? 0) + repo.used_bytes);
  }
  const connected = new Set(statuses.filter((s) => s.connected).map((s) => s.platform));
  for (const platform of connected) {
    if (!bytes.has(platform)) bytes.set(platform, 0);
  }
  const total = [...bytes.values()].reduce((sum, b) => sum + b, 0);
  return [...bytes.entries()]
    .map(([platform, used]) => ({
      platform,
      bytes: used,
      share: total > 0 ? used / total : 0,
      connected: connected.has(platform),
    }))
    .sort((a, b) => b.bytes - a.bytes || a.platform.localeCompare(b.platform));
}

export type RingTone = "ok" | "warn" | "danger";

export function ringTone(percent: number): RingTone {
  if (percent > 90) return "danger";
  if (percent > 70) return "warn";
  return "ok";
}

export function clampPercent(used: number, max: number): number {
  if (max <= 0 || used <= 0) return 0;
  return Math.min((used / max) * 100, 100);
}
