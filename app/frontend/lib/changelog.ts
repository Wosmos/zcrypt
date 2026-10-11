import releases from "@/lib/changelog.json";

export type ChangeKind = "new" | "improved" | "fixed" | "security";

export interface ReleaseGroup {
  kind: ChangeKind;
  items: string[];
}

export interface Release {
  version: string;
  date: string | null;
  key: string;
  groups: ReleaseGroup[];
}

export const CHANGE_KINDS: readonly ChangeKind[] = ["new", "improved", "fixed", "security"];

export const RELEASES = releases as Release[];

export const LATEST_RELEASED: Release = RELEASES.find((r) => r.date !== null) ?? RELEASES[0];
export const LATEST_RELEASED_VERSION = LATEST_RELEASED.version;

export function findRelease(version: string): Release | undefined {
  return RELEASES.find((r) => r.version === version);
}

export function adjacentReleases(version: string): { newer?: Release; older?: Release } {
  const i = RELEASES.findIndex((r) => r.version === version);
  if (i < 0) return {};
  return { newer: RELEASES[i - 1], older: RELEASES[i + 1] };
}
