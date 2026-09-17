// Runtime lookup of the latest GitHub release so the /download page always
// reflects what's actually published — no hardcoded version or filenames.
// All three download islands share a single cached fetch.

import { GITHUB_REPO } from "@/lib/data";

const LATEST_RELEASE_API = "https://api.github.com/repos/Wosmos/zcrypt/releases/latest";

/**
 * Every installer is served through our own redirect rather than linked at
 * GitHub directly. Bundler filenames embed the version
 * (`zcrypt_0.1.4_aarch64.dmg`), so a direct link has to know the current
 * release — which is why the download page, the docs and install.sh had each
 * drifted onto a different URL. `/dl/<target>` is stable forever: the backend
 * resolves the asset at click time, and records the download on the way past.
 */
export type DownloadTarget =
  | "macos-arm64"
  | "macos-x64"
  | "windows-exe"
  | "windows-msi"
  | "linux-appimage"
  | "linux-deb"
  | "linux-rpm"
  | "android"
  | "cli-darwin-arm64"
  | "cli-darwin-amd64"
  | "cli-linux-amd64"
  | "cli-linux-arm64"
  | "cli-windows-amd64"
  | "cli-windows-arm64";

export const dl = (target: DownloadTarget): string => `/dl/${target}`;

// Shared by the hero CTA and the Android sideload card so there's one source
// of truth. The APK lives on the rolling `android-latest` prerelease, which
// the redirect knows about.
export const ANDROID_APK_URL = dl("android");
export const ANDROID_RELEASE_PAGE = `${GITHUB_REPO}/releases/tag/android-latest`;

export type PlatformId = "macos" | "windows" | "linux";

// What the hero CTA can detect a visitor as, beyond the three desktop
// platforms above — used only for picking what DownloadCta shows, never for
// indexing release.desktop (Android/iOS ship no desktop bundle).
export type DetectedDevice = PlatformId | "android" | "ios";

export interface DownloadOption {
  label: string;
  sublabel: string;
  href: string;
  recommended?: boolean;
  /** Short, always-visible setup caveat (e.g. AppImage's chmod/FUSE step). */
  note?: string;
}

interface DesktopPlatform {
  id: PlatformId;
  name: string;
  blurb: string;
  /** Explains an OS trust prompt the visitor should expect (unsigned build). */
  securityNote?: { title: string; body: string };
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
  /** True when this is the hardcoded fallback (GitHub API was unreachable). */
  isFallback?: boolean;
}

/**
 * Download set used when the live lookup fails (GitHub API rate limit, say).
 *
 * Every href is a `/dl/<target>` redirect, so unlike the old table this can no
 * longer go stale: it names no version and no filename, and the backend still
 * resolves each target to whatever the newest release actually holds. The only
 * thing lost when the lookup fails is the cosmetic version label.
 */
function buildFallbackRelease(): ReleaseData {
  return {
    version: "latest",
    htmlUrl: `${GITHUB_REPO}/releases/latest`,
    isFallback: true,
    desktop: [
      {
        id: "macos",
        name: "macOS",
        blurb: BLURB.macos,
        securityNote: SECURITY_NOTE.macos,
        options: [
          {
            label: "Apple Silicon",
            sublabel: "M1–M4 · .dmg",
            href: dl("macos-arm64"),
            recommended: true,
          },
        ],
      },
      {
        id: "windows",
        name: "Windows",
        blurb: BLURB.windows,
        securityNote: SECURITY_NOTE.windows,
        options: [
          {
            label: "Installer",
            sublabel: "x64 · .exe",
            href: dl("windows-exe"),
            recommended: true,
          },
          {
            label: "MSI package",
            sublabel: "x64 · .msi",
            href: dl("windows-msi"),
          },
        ],
      },
      {
        id: "linux",
        name: "Linux",
        blurb: BLURB.linux,
        options: [
          {
            label: "Fedora / RHEL",
            sublabel: "x86_64 · .rpm",
            href: dl("linux-rpm"),
          },
          {
            label: "Debian / Ubuntu",
            sublabel: "amd64 · .deb",
            href: dl("linux-deb"),
          },
          {
            label: "Portable",
            sublabel: "x86_64 · AppImage",
            href: dl("linux-appimage"),
            note: APPIMAGE_NOTE,
          },
        ],
      },
    ],
    cli: [
      { os: "macOS", arch: "Apple Silicon", href: dl("cli-darwin-arm64") },
      { os: "macOS", arch: "Intel", href: dl("cli-darwin-amd64") },
      { os: "Linux", arch: "x64", href: dl("cli-linux-amd64") },
      { os: "Linux", arch: "ARM64", href: dl("cli-linux-arm64") },
      { os: "Windows", arch: "x64", href: dl("cli-windows-amd64") },
      { os: "Windows", arch: "ARM64", href: dl("cli-windows-arm64") },
    ],
    checksumsUrl: null,
  };
}

interface RawAsset {
  name: string;
  browser_download_url: string;
}

const BLURB: Record<PlatformId, string> = {
  macos: "Apple Silicon, macOS 11 Big Sur or later.",
  windows: "Windows 10 and 11, 64-bit.",
  linux: "64-bit. Pick your distro's package, or the portable build for anything else.",
};

// Both desktop installers are unsigned (no paid code-signing cert yet), so
// the OS blocks them on first launch. Real, expected, dismissible — but
// undocumented until now, which is the worst first impression for an
// encryption product. Surfaced as a collapsed note under each card.
const SECURITY_NOTE: Record<"macos" | "windows", { title: string; body: string }> = {
  macos: {
    title: "macOS will block it once — that's expected",
    body: "zcrypt isn't notarized yet, so Gatekeeper flags it as from an unidentified developer the first time you open it. Right-click (or Control-click) the app, choose Open, then confirm in the dialog — a one-time step. Still blocked? System Settings → Privacy & Security → Open Anyway.",
  },
  windows: {
    title: "Windows SmartScreen will flag it — that's expected",
    body: 'We haven\'t bought a code-signing certificate yet, so Windows treats the installer as unrecognized. Click "More info", then "Run anyway". Normal for an independently-published app without a paid certificate — not a sign anything\'s wrong with the file.',
  },
};

// AppImages don't run on double-click out of the box, and Fedora needs an
// extra package on top of that — neither step is discoverable without this.
const APPIMAGE_NOTE =
  "One-time setup: chmod +x the file, then run it. On Fedora, also install FUSE first — sudo dnf install fuse.";

/** Turn a release's raw assets into categorized, ordered download options. */
export function parseAssets(assets: RawAsset[], tag: string, htmlUrl: string): ReleaseData {
  const version = tag.replace(/^v/, "");
  const find = (pred: (n: string) => boolean) => assets.find((a) => pred(a.name.toLowerCase()));

  const macAarch = find((n) => n.endsWith(".dmg") && /aarch64|arm64/.test(n));
  const macIntel = find((n) => n.endsWith(".dmg") && /x64|x86_64|intel/.test(n));
  const winExe = find((n) => n.endsWith(".exe"));
  const winMsi = find((n) => n.endsWith(".msi"));
  const linAppImage = find((n) => n.endsWith(".appimage"));
  const linDeb = find((n) => n.endsWith(".deb"));
  const linRpm = find((n) => n.endsWith(".rpm"));

  // The live asset list still decides WHICH options to show — an installer
  // whose build leg didn't publish must not be offered — but the href is the
  // stable redirect, never the versioned asset URL.
  const opt = (
    a: RawAsset | undefined,
    target: DownloadTarget,
    label: string,
    sublabel: string,
    recommended?: boolean,
    note?: string,
  ): DownloadOption | null => (a ? { label, sublabel, href: dl(target), recommended, note } : null);

  const macOptions = [
    opt(macAarch, "macos-arm64", "Apple Silicon", "M1–M4 · .dmg", true),
    opt(macIntel, "macos-x64", "Intel", "x86_64 · .dmg"),
  ].filter(Boolean) as DownloadOption[];

  const winOptions = [
    opt(winExe, "windows-exe", "Installer", "x64 · .exe", true),
    opt(winMsi, "windows-msi", "MSI package", "x64 · .msi"),
  ].filter(Boolean) as DownloadOption[];

  // Distro-named packages first — they're the correct answer for the vast
  // majority of Linux visitors and install cleanly with no extra steps.
  // Portable last: it works everywhere but needs the two steps in its note.
  const linOptions = [
    opt(linRpm, "linux-rpm", "Fedora / RHEL", "x86_64 · .rpm"),
    opt(linDeb, "linux-deb", "Debian / Ubuntu", "amd64 · .deb"),
    opt(linAppImage, "linux-appimage", "Portable", "x86_64 · AppImage", undefined, APPIMAGE_NOTE),
  ].filter(Boolean) as DownloadOption[];

  const allPlatforms: DesktopPlatform[] = [
    {
      id: "macos",
      name: "macOS",
      blurb: BLURB.macos,
      securityNote: SECURITY_NOTE.macos,
      options: macOptions,
    },
    {
      id: "windows",
      name: "Windows",
      blurb: BLURB.windows,
      securityNote: SECURITY_NOTE.windows,
      options: winOptions,
    },
    { id: "linux", name: "Linux", blurb: BLURB.linux, options: linOptions },
  ];
  const desktop = allPlatforms.filter((p) => p.options.length > 0);

  // CLI/TUI binaries (GoReleaser): zcrypt_<ver>_<os>_<arch>.(tar.gz|zip)
  const cliRe = /_(darwin|linux|windows)_(amd64|arm64)\.(tar\.gz|zip)$/;
  // Mirrors cliRe's arch group — see archName below.
  type CliArch = "amd64" | "arm64";
  const osName: Record<string, CliBinary["os"]> = {
    darwin: "macOS",
    linux: "Linux",
    windows: "Windows",
  };
  // Closed key set, matching cliRe's arch group exactly — so the lookup below is
  // total and needs no runtime fallback. Widening cliRe without adding the arch
  // here is a compile error rather than a raw "386" leaking into the UI.
  const archName: Record<CliArch, string> = {
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
          : archName[m[2] as CliArch];
      return { os, arch, href: dl(`cli-${m[1]}-${m[2]}` as DownloadTarget) };
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

let cache: Promise<ReleaseData> | null = null;

/**
 * Fetch the latest release's download data.
 *
 * The response is cached for an hour (`next.revalidate`): unauthenticated
 * GitHub API calls are capped at 60/hour per IP, and Next no longer caches
 * `fetch` by default, so an uncached call here means every visit to /download
 * spends one of those 60 — after which everyone is served the stale fallback
 * version instead of the real latest release.
 *
 * A failed lookup is deliberately NOT memoised: caching the rejection would
 * pin this server instance to the fallback until it recycled, long after
 * GitHub started answering again.
 */
export function getLatestRelease(): Promise<ReleaseData> {
  if (cache) return cache;
  const pending = fetch(LATEST_RELEASE_API, {
    headers: { Accept: "application/vnd.github+json" },
    next: { revalidate: 3600 },
  })
    .then((res) => {
      if (!res.ok) throw new Error(`GitHub API ${res.status}`);
      return res.json();
    })
    .then((data: { tag_name: string; html_url: string; assets: RawAsset[] }) => {
      const parsed = parseAssets(data.assets ?? [], data.tag_name ?? "", data.html_url);
      // If the latest release has no desktop installers yet (e.g. mid-build),
      // fall back so users still get working downloads.
      return parsed.desktop.length > 0 ? parsed : buildFallbackRelease();
    })
    .catch(() => {
      cache = null; // let the next request try GitHub again
      return buildFallbackRelease();
    });
  cache = pending;
  return pending;
}

/** Where to send people when the API is unavailable. */
export const RELEASES_FALLBACK_URL = `${GITHUB_REPO}/releases/latest`;
