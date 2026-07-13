# Changelog

All notable changes to zcrypt are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.2.0] - 2026-07-13

### Added

- Custom theme — pick your own accent, canvas, and background
- Per-card customization — icon, color, and background for files and folders,
  stored as an opaque encrypted style
- First-time passphrase warning before unlocking a fresh vault
- Deleted Files and Device Transfer surfaced across mobile nav and the command palette
- Auto-resume for interrupted downloads on tab return / reconnect
- Device tuning tier calibrated with a crypto micro-benchmark
- Mobile file-grid polish with gallery-style drag-to-select

### Changed

- Settings redesign — responsive grids, pagination, and an activity table
- Upload concurrency decoupled from the CPU tier — fans out by network and batch size
- HuggingFace storage — DB-driven batch commit and single-commit delete
- Trash — bulk purge/restore collapsed into a single request
- Change-scoped pre-push quality gate (`scripts/prepush.sh`) with installable hooks
- Corrected per-platform storage capacity and rate-limit copy

### Fixed

- Thumbnails — seed the preview from the local file at upload time so a fresh
  upload no longer shimmers while it re-decrypts; time-box the shimmer and reject
  blank canvases
- Vault lock is now genuine — decrypted thumbnails are evicted and a lock mask applied
- Share dialogs truncate long file and folder names
- Storage integrity — verify HuggingFace chunks are retrievable before marking them durable

### Security

- Pinned the Go toolchain to 1.25.12 to remediate GO-2026-5856 (Encrypted Client
  Hello privacy leak in the `crypto/tls` standard library)

## [0.1.3] - 2026-06-28

### Added

- Fall back to a known release when GitHub API is unavailable

### Fixed

- Ad-hoc sign the macOS build

## [0.1.2] - 2026-06-28

### Fixed

- Allow Tauri app origins in CORS
- Use a monochrome template tray icon

## [0.1.1] - 2026-06-27

### Added

- Revamp TUI page with real install commands, fix false claims
- Add 10 interactive bottom navigation bar samples
- Bulk delete, revamped upload queue, TUI file picker & new logo
- Integrate Vercel Analytics and add .env.prod to gitignore
- Enhance upload pipeline integration tests with mock adapter and improved validation
- Implement unique X-Forwarded-For handling in integration tests
- Unified explorer, multi-format viewers, per-folder encryption, transfer manager
- In-memory decrypt cache with lock-aware eviction
- Cache + prefetch in the in-browser file decryptor
- Default grid view with selectable column density and reachable card actions
- Squircle logo mark, hero and showcase polish
- Add comparison page for zcrypt vs Proton Drive
- Add download page with desktop apps, CLI, and web app sections
- Resolve downloads from the latest GitHub release at runtime

### Changed

- Enhance visibility change handling in usePlatformHealth hook
- Update database connection pool settings for Neon compatibility
- Enhance authentication tests and helpers

### Fixed

- Update email for vulnerability reporting in SECURITY.md and adjust service name in CI workflow
- Route all zstd decompression through one shared codec
- Pdf.js rendering, image LQIP, prefetch, wrong-password recovery
- Bump pgx/v5 to v5.9.2 to patch GO-2026-5004
- Fix CI build failures, add proper icons, fix squircle
- Update frontend build process to reflect new output structure and enhance sitemap documentation
- Bake backend API URL into builds; automate tagged releases
- Update backend URL references to use NEXT_PUBLIC_API_URL for consistency

### Performance

- Event-driven sync worker, split cleanup, devMode rate bypass, load tests

## [0.1.0] - 2026-03-25

### Added

- Implement initial frontend application structure with core pages, components, utilities, and backend services for file management.
- Introduce a multi-platform file upload and storage service with a web interface.
- Implement initial application structure including robust authentication, user management, and platform integration.
- Add initial frontend application structure, including authentication flows, core app features, marketing pages, and common UI components.
- Implement core Next.js application structure with global styling, dark mode support, an animated circuit background, and a new demo page.
- Implement initial application structure including user authentication, dashboard, file management, platform integrations, and settings.
- Implement core Zstash application including backend services for authentication, file management, and repository handling, alongside a frontend user interface and administrative panels.
- Implement initial Next.js app router pages and loading UIs for various application routes.
- Add Telegram as a new supported platform with full backend adapter and frontend integration.
- Implement core frontend application structure with sidebar navigation, authentication, marketing pages, and backend compression logic.
- Add Dockerfile for Railway deployment
- Add Claude settings with various permissions and ignore the .claude directory.
- Implement user authentication including registration, login, logout, password reset, email verification, and a frontend auth guard.
- Initialize frontend project with dependencies and add backend email authentication.
- Implement concurrent file uploads with progress tracking, add admin user plan management, introduce a confirm modal for disconnections, and include backend event heartbeats.
- Error handling & resilience — error boundaries, SSE reconnect with backoff, API retry, panic recovery, graceful shutdown
- Database hardening — add missing indexes, atomic InsertFileWithChunks transaction
- Structured logging with log/slog and request logging middleware
- Accessibility — skip-to-content link, keyboard-accessible upload zone, aria-labels on pagination and sidebar
- Implement core backend server with authentication, platform integrations, file management, and rate limiting, alongside initial frontend components.
- Introduce core frontend application structure, essential UI components, theme management, and platform connection features.
- Add user authentication including registration, login, email verification, and password reset functionality.
- Introduce core backend and frontend application with authentication, OAuth, and initial features.
- Implement core file management features including upload, download, and encryption across frontend and backend, along with initial documentation.
- Implement client-side file upload and download with encryption, compression, and device-aware resource tuning.
- Implement Hugging Face model upload functionality with full-stack integration.
- Add GitHub storage adapter and implement a new chunked file upload API with concurrency control.
- Establish foundational application with backend services, admin panel, and comprehensive frontend UI.
- Enable Turbopack, configure local `sql-wasm.wasm` loading, update Next.js type imports, and adjust marquee text color.
- Rebrand zpush to zcrypt across backend, TUI, and root configs
- Premium UI overhaul — design system, auth layout, landing page, new pages
- Implement comprehensive file management with file table, sorting, selection, download, preview, and sharing capabilities.
- Implement comprehensive admin and user-facing features, including token management, audit logs, and new application pages.
- Implement core backend services for file management, authentication, user administration, and platform integration with initial frontend components.
- Introduce new sidebar component with user details, navigation, storage quota, and theme/logout functionality, along with new dashboard and analytics pages.
- Add initial marketing site with documentation pages, pricing, and SEO components including JSON-LD and sitemap.
- Introduce core application structure, backend services, and frontend UI for ZStash features including shared vaults, deadman, send, pad, and settings.
- Implement initial application structure with frontend UI, documentation, and backend services.
- Implement file upload, sharing, and download features with backend indexing and frontend components.
- Add cross-platform TUI distribution pipeline

### Fixed

- Disable API rewrites in production to prevent Vercel private DNS error
- Security hardening — CORS whitelist, JWT alg validation, password complexity, auth rate limiting, filename validation, error sanitization, security headers
- Security hardening round 2 and code quality improvements

