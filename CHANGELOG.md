# Changelog

All notable changes to zcrypt are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Download page (`/download`)** — auto-detects the visitor's OS and offers a
  one-click download, with native desktop apps (macOS, Windows, Linux), the
  single-binary CLI/TUI, and a no-install web-app option. Linked from the nav,
  footer, and sitemap, with full SEO metadata.
- **Automated desktop releases** — pushing a version tag now builds the desktop
  installers (`.dmg`, `.exe`/`.msi`, `.AppImage`/`.deb`/`.rpm`) for all platforms
  and publishes them to the matching GitHub Release.

### Fixed

- **Desktop app could not reach the backend.** The static export now bakes in
  `NEXT_PUBLIC_API_URL`, so authentication (password, magic link, Google, GitHub)
  works in the desktop app instead of every request failing silently.
- **Desktop CI build failure** — corrected the static-export output path
  (`.next-export`) that the desktop workflow copied from.
- **Sitemap build error** — removed a stale `docsNav` reference that broke
  `next build` / typecheck.

## [0.1.0] - 2026-03-26

### Added

- Initial release: zero-knowledge encrypted cloud drive (web), terminal app
  (TUI), and backend. AES-256-GCM client-side encryption, bring-your-own-storage
  (GitHub, GitLab, Hugging Face, Telegram), folders, sharing, and transfers.

[Unreleased]: https://github.com/Wosmos/zcrypt/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Wosmos/zcrypt/releases/tag/v0.1.0
