// Runtime lookup of the latest GitHub release so the /download page always
// reflects what's actually published — no hardcoded version or filenames.
// All three download islands share a single cached fetch.

import { GITHUB_REPO } from "@/lib/data";

const LATEST_RELEASE_API =
  "https://api.github.com/repos/Wosmos/zcrypt/releases/latest";

export type PlatformId = "macos" | "windows" | "linux";

export interface DownloadOption {
  label: string;
  sublabel: string;
  href: string;
  recommended?: boolean;
}

export interface DesktopPlatform {
  id: PlatformId;
  name: string;
  blurb: string;
  options: DownloadOption[];
}

export interface CliBinary {
  os: "macOS" | "Linux" | "Windows";
  arch: string;
  href: string;
}

export interface ReleaseData {
  version: string; // e.g. "0.1.0" (tag without leading "v")
  htmlUrl: string;
  desktop: DesktopPlatform[];
  cli: CliBinary[];
  checksumsUrl: string | null;
}

interface RawAsset {
  name: string;
  browser_download_url: string;
}

const BLURB: Record<PlatformId, string> = {
  macos: "Apple Silicon, macOS 11 Big Sur or later.",
  windows: "Windows 10 and 11, 64-bit.",
  linux: "64-bit. AppImage runs anywhere; deb/rpm for your package manager.",
};

/** Turn a release's raw assets into categorized, ordered download options. */
export function parseAssets(
  assets: RawAsset[],
  tag: string,
  htmlUrl: string
): ReleaseData {
  const version = tag.replace(/^v/, "");
  const find = (pred: (n: string) => boolean) =>
    assets.find((a) => pred(a.name.toLowerCase()));

  const macAarch = find((n) => n.endsWith(".dmg") && /aarch64|arm64/.test(n));
  const macIntel = find((n) => n.endsWith(".dmg") && /x64|x86_64|intel/.test(n));
  const winExe = find((n) => n.endsWith(".exe"));
  const winMsi = find((n) => n.endsWith(".msi"));
  const linAppImage = find((n) => n.endsWith(".appimage"));
  const linDeb = find((n) => n.endsWith(".deb"));
  const linRpm = find((n) => n.endsWith(".rpm"));

  const opt = (
    a: RawAsset | undefined,
    label: string,
    sublabel: string,
    recommended?: boolean
  ): DownloadOption | null =>
    a ? { label, sublabel, href: a.browser_download_url, recommended } : null;

  const macOptions = [
    opt(macAarch, "Apple Silicon", "M1–M4 · .dmg", true),
    opt(macIntel, "Intel", "x86_64 · .dmg"),
  ].filter(Boolean) as DownloadOption[];

  const winOptions = [
    opt(winExe, "Installer", "x64 · .exe", true),
    opt(winMsi, "MSI package", "x64 · .msi"),
  ].filter(Boolean) as DownloadOption[];

  const linOptions = [
    opt(linAppImage, "AppImage", "x86_64 · portable", true),
    opt(linDeb, "Debian / Ubuntu", "amd64 · .deb"),
    opt(linRpm, "Fedora / RHEL", "x86_64 · .rpm"),
  ].filter(Boolean) as DownloadOption[];

  const allPlatforms: DesktopPlatform[] = [
    { id: "macos", name: "macOS", blurb: BLURB.macos, options: macOptions },
    { id: "windows", name: "Windows", blurb: BLURB.windows, options: winOptions },
    { id: "linux", name: "Linux", blurb: BLURB.linux, options: linOptions },
  ];
  const desktop = allPlatforms.filter((p) => p.options.length > 0);

  // CLI/TUI binaries (GoReleaser): zcrypt_<ver>_<os>_<arch>.(tar.gz|zip)
  const cliRe = /_(darwin|linux|windows)_(amd64|arm64)\.(tar\.gz|zip)$/;
  const osName: Record<string, CliBinary["os"]> = {
    darwin: "macOS",
    linux: "Linux",
    windows: "Windows",
  };
  const archName: Record<string, string> = {
    amd64: "x64",
    arm64: "ARM64",
  };
  const cli: CliBinary[] = assets
    .map((a) => {
      const m = a.name.toLowerCase().match(cliRe);
      if (!m) return null;
      const os = osName[m[1]];
      const arch =
        m[1] === "darwin"
          ? m[2] === "arm64"
            ? "Apple Silicon"
            : "Intel"
          : archName[m[2]] ?? m[2];
      return { os, arch, href: a.browser_download_url };
    })
    .filter(Boolean) as CliBinary[];

  const checksums = assets.find((a) => /checksums?\.txt$/i.test(a.name));

  return {
    version,
    htmlUrl,
    desktop,
    cli,
    checksumsUrl: checksums?.browser_download_url ?? null,
  };
}

let cache: Promise<ReleaseData | null> | null = null;

/** Fetch (and cache for the session) the latest release's download data. */
export function getLatestRelease(): Promise<ReleaseData | null> {
  if (cache) return cache;
  cache = fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
  })
    .then((res) => {
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      return res.json();
    })
    .then((data: { tag_name: string; html_url: string; assets: RawAsset[] }) =>
      parseAssets(data.assets ?? [], data.tag_name ?? "", data.html_url)
    )
    .catch(() => null);
  return cache;
}

/** Where to send people when the API is unavailable. */
export const RELEASES_FALLBACK_URL = `${GITHUB_REPO}/releases/latest`;
