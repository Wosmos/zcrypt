import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseAssets, RELEASES_FALLBACK_URL } from "@/lib/releases";
import { GITHUB_REPO } from "@/lib/data";

interface RawAsset {
  name: string;
  browser_download_url: string;
}

const FULL_ASSETS: RawAsset[] = [
  { name: "zcrypt_0.1.0_aarch64.dmg", browser_download_url: "url-mac-arm" },
  { name: "zcrypt_0.1.0_x86_64.dmg", browser_download_url: "url-mac-intel" },
  { name: "zcrypt_0.1.0_x64-setup.exe", browser_download_url: "url-win-exe" },
  { name: "zcrypt_0.1.0_x64_en-US.msi", browser_download_url: "url-win-msi" },
  { name: "zcrypt_0.1.0_amd64.AppImage", browser_download_url: "url-lin-appimage" },
  { name: "zcrypt_0.1.0_amd64.deb", browser_download_url: "url-lin-deb" },
  { name: "zcrypt-0.1.0-1.x86_64.rpm", browser_download_url: "url-lin-rpm" },
  { name: "zcrypt_0.1.0_darwin_arm64.tar.gz", browser_download_url: "url-cli-mac-arm" },
  { name: "zcrypt_0.1.0_darwin_amd64.tar.gz", browser_download_url: "url-cli-mac-intel" },
  { name: "zcrypt_0.1.0_linux_amd64.tar.gz", browser_download_url: "url-cli-linux-x64" },
  { name: "zcrypt_0.1.0_linux_arm64.tar.gz", browser_download_url: "url-cli-linux-arm" },
  { name: "zcrypt_0.1.0_windows_amd64.zip", browser_download_url: "url-cli-win-x64" },
  { name: "zcrypt_0.1.0_windows_arm64.zip", browser_download_url: "url-cli-win-arm" },
  { name: "checksums.txt", browser_download_url: "url-checksums" },
  { name: "some-unrelated-source.tar.gz", browser_download_url: "url-unmatched" },
];

describe("parseAssets", () => {
  it("categorizes a full release into desktop, cli, and checksums", () => {
    const data = parseAssets(FULL_ASSETS, "v0.1.0", "https://github.com/x/y/releases/tag/v0.1.0");

    expect(data.version).toBe("0.1.0");
    expect(data.htmlUrl).toBe("https://github.com/x/y/releases/tag/v0.1.0");
    expect(data.isFallback).toBeUndefined();

    const mac = data.desktop.find((p) => p.id === "macos")!;
    expect(mac.options).toEqual([
      { label: "Apple Silicon", sublabel: "M1–M4 · .dmg", href: "url-mac-arm", recommended: true },
      { label: "Intel", sublabel: "x86_64 · .dmg", href: "url-mac-intel", recommended: undefined },
    ]);

    const win = data.desktop.find((p) => p.id === "windows")!;
    expect(win.options).toEqual([
      { label: "Installer", sublabel: "x64 · .exe", href: "url-win-exe", recommended: true },
      { label: "MSI package", sublabel: "x64 · .msi", href: "url-win-msi", recommended: undefined },
    ]);

    const lin = data.desktop.find((p) => p.id === "linux")!;
    expect(lin.options).toEqual([
      { label: "AppImage", sublabel: "x86_64 · portable", href: "url-lin-appimage", recommended: true },
      { label: "Debian / Ubuntu", sublabel: "amd64 · .deb", href: "url-lin-deb", recommended: undefined },
      { label: "Fedora / RHEL", sublabel: "x86_64 · .rpm", href: "url-lin-rpm", recommended: undefined },
    ]);

    expect(data.cli).toEqual([
      { os: "macOS", arch: "Apple Silicon", href: "url-cli-mac-arm" },
      { os: "macOS", arch: "Intel", href: "url-cli-mac-intel" },
      { os: "Linux", arch: "x64", href: "url-cli-linux-x64" },
      { os: "Linux", arch: "ARM64", href: "url-cli-linux-arm" },
      { os: "Windows", arch: "x64", href: "url-cli-win-x64" },
      { os: "Windows", arch: "ARM64", href: "url-cli-win-arm" },
    ]);

    expect(data.checksumsUrl).toBe("url-checksums");
  });

  it("leaves the tag untouched when it has no leading v", () => {
    const data = parseAssets([], "0.2.0", "https://example.com");
    expect(data.version).toBe("0.2.0");
  });

  it("matches checksum variant without trailing s, case-insensitively", () => {
    const data = parseAssets(
      [{ name: "CHECKSUM.TXT", browser_download_url: "u" }],
      "v1.0.0",
      "https://example.com"
    );
    expect(data.checksumsUrl).toBe("u");
  });

  it("drops platforms with no matching assets and reports null checksums", () => {
    const data = parseAssets(
      [{ name: "zcrypt_0.1.0_aarch64.dmg", browser_download_url: "u" }],
      "v0.1.0",
      "https://example.com"
    );
    expect(data.desktop.map((p) => p.id)).toEqual(["macos"]);
    expect(data.cli).toEqual([]);
    expect(data.checksumsUrl).toBeNull();
  });

  it("returns fully empty desktop/cli for no assets at all", () => {
    const data = parseAssets([], "v0.0.1", "https://example.com");
    expect(data.desktop).toEqual([]);
    expect(data.cli).toEqual([]);
    expect(data.checksumsUrl).toBeNull();
  });
});

describe("getLatestRelease", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it("returns parsed data from a successful fetch and caches it across calls", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        tag_name: "v9.9.9",
        html_url: "https://github.com/x/y/releases/tag/v9.9.9",
        assets: [{ name: "zcrypt_9.9.9_aarch64.dmg", browser_download_url: "u" }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getLatestRelease } = await import("@/lib/releases");
    const first = await getLatestRelease();
    const second = await getLatestRelease();

    expect(first?.version).toBe("9.9.9");
    expect(first?.isFallback).toBeUndefined();
    expect(second).toBe(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/repos/Wosmos/zcrypt/releases/latest",
      { headers: { Accept: "application/vnd.github+json" } }
    );
  });

  it("falls back when the parsed release has no desktop installers yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ tag_name: "v9.9.9", html_url: "https://example.com", assets: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getLatestRelease } = await import("@/lib/releases");
    const data = await getLatestRelease();

    expect(data?.isFallback).toBe(true);
    expect(data?.desktop.length).toBeGreaterThan(0);
  });

  it("falls back when the GitHub API responds with a non-ok status", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403 });
    vi.stubGlobal("fetch", fetchMock);

    const { getLatestRelease } = await import("@/lib/releases");
    const data = await getLatestRelease();

    expect(data?.isFallback).toBe(true);
  });

  it("falls back when fetch rejects outright", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const { getLatestRelease } = await import("@/lib/releases");
    const data = await getLatestRelease();

    expect(data?.isFallback).toBe(true);
  });

  it("falls back gracefully when tag_name/assets are missing from the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ html_url: "https://example.com" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getLatestRelease } = await import("@/lib/releases");
    const data = await getLatestRelease();

    expect(data?.isFallback).toBe(true);
  });

  it("builds a fully-populated fallback release (all platforms, cli, checksums)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("down"));
    vi.stubGlobal("fetch", fetchMock);

    const { getLatestRelease } = await import("@/lib/releases");
    const data = await getLatestRelease();

    expect(data).not.toBeNull();
    expect(data!.isFallback).toBe(true);
    expect(data!.desktop.map((p) => p.id)).toEqual(["macos", "windows", "linux"]);
    expect(data!.desktop.find((p) => p.id === "macos")!.options).toHaveLength(1);
    expect(data!.desktop.find((p) => p.id === "windows")!.options).toHaveLength(2);
    expect(data!.desktop.find((p) => p.id === "linux")!.options).toHaveLength(3);
    expect(data!.cli).toHaveLength(6);
    expect(data!.checksumsUrl).toContain("checksums.txt");
    expect(data!.htmlUrl).toContain("releases/tag/v");
  });
});

describe("RELEASES_FALLBACK_URL", () => {
  it("points at the repo's releases/latest page", () => {
    expect(RELEASES_FALLBACK_URL).toBe(`${GITHUB_REPO}/releases/latest`);
  });
});
