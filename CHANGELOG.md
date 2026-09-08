# Changelog

All notable changes to zcrypt are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).


## [0.1.4] - 2026-09-05

### Added

- Dedicated Insights dashboard
- Make breadcrumb drop targets visible during drag
- Guided connect with auto-detected chat ID
- Folder details drawer + Apple-style name truncation + explorer refresh
- App shell polish — top bar, sidebar, dropdowns, toasts, dark palette
- Reusable hero component + nav and download refresh
- Docs footer + sidebar and layout refresh
- Per-device color themes, squircle corners, macOS-style folders
- MacOS-style file icons, image+video thumbnails, lazy loading
- CSP (Report-Only) + per-user X25519 keypairs for ZK sharing
- P2 — per-member key grants + ECIES sealed-box for ZK sharing
- Wire shared-vaults UI to end-to-end key grants
- P3 backend — member file access + CEK re-wrap under space key
- Expose shared-file list with space-wrapped CEKs in vault detail
- Client lib for sharing + downloading files in a space
- File management UI in shared vaults — add, download, remove
- Show member key fingerprints for out-of-band verification
- Optional per-space size limit with server-side enforcement
- Dedicated /spaces destination + nav entry
- P5 backend — space-key rotation for true revocation
- P5 frontend — auto re-key on member removal + manual Re-key
- Backend for public folder links
- Shareable folders via public link (frontend)
- Rework the vault UI for phones
- Resume a partial upload across page reloads
- Unfinished-uploads section (resume / discard)
- Stream large downloads to disk (true 25GB support)
- Throttle platform pushes to stay under rate caps (GitHub ~7GB/hr)
- Pause / resume / retry-continue parity with uploads
- Direction cue + progress sheen so active transfers read clearly
- 3D-deck notification design with a11y hardening
- Route-accurate loading skeletons and refined shimmer
- Unify broad audio/video format detection
- Player overhaul — aspect, audio skin, drawer, transport
- Relabel tools and correct copy to match behavior
- Created date in get-info, deleted-on in trash, folder share-link history
- About page, wosmo branding assets, footer + json-ld
- One nested .zip download via subtree endpoint
- Deadpan maker voice + wire About into nav
- Block duplicate sibling folder names
- Show storage platform in the get-info drawer
- Harden verification, encrypt secrets at rest, add backup codes
- Cap single files at 10 GB
- Tamper-evident audit log + re-auth friction on destructive ops
- Per-user keyed content hash — close the confirmation-of-file leak
- Encrypt file names — server stores only opaque ciphertext
- Mask size + upload time on public share/send endpoints
- Hold a screen wake lock during uploads + auto-resume after interruption
- Calibrate the tuning tier with a crypto micro-benchmark
- Auto-resume interrupted downloads on tab return / reconnect
- Polish mobile file grid + gallery-style drag-to-select
- DB-driven batch commit + single-commit delete for HuggingFace
- First-time passphrase warning before unlocking a fresh vault
- Expose Deleted Files and Device Transfer across mobile nav and command palette
- Store opaque encrypted style for files and folders
- Customizable icon, color, and background for cards
- Custom theme with your own accent, canvas, and background
- Generate a descriptive llms.txt (and /llm.txt) + tighten robots
- Surface styles, themed folder shapes, and light/dark custom themes
- Make surface styles a true design language, not a card reskin
- Carry a per-file wrapped name for shared-vault files
- Pick files to add into a shared space
- Cross-implementation conformance vectors + normative format spec
- Scaffold zcrypt-core with conformance-proven crypto + zstd
- Port platform adapters + client architecture to zcrypt-core
- Replace the Go sidecar with in-process zcrypt-core commands
- Live cross-device file events on the web + desktop architecture doc
- Port the pipeline engines + local ledger + control-plane API
- Port the HuggingFace LFS adapter
- Byos-direct control plane + cross-device change feed
- Client-side delete engine + own-token credential provider
- Byos-direct delete — metadata-only purge + locator contract
- Keychain creds provider + delete_file command
- Byos-direct download — fetch chunks from the user's own storage
- Byos-direct upload — push chunks to the user's own storage
- Emit cross-device file event on move
- Launch-at-login (autostart) + folder-watch dep
- Folder-watch backup agent + backup notifications
- MacOS Touch ID unlock + gate desktop-only APIs for mobile builds
- Touch ID unlock button + Android sideload download page
- Mark the Android sideload build as Beta
- Bigger QR + Download/Copy-link actions, trimmed copy
- Decrypt_to_memory engine + shared acquire_chunk
- Route thumbnails/preview/viewer through the core on desktop
- Retry byos-direct chunk push before failing
- Permanently delete via the core on desktop
- Shared-space download/decrypt via an already-resolved key
- Route shared-space download through the core
- Zeroize key material after last use
- Inactivity auto-lock for the cached passphrase
- Bulk_download engine — N files streamed into one ZIP
- Bulk ZIP download through the core
- Parallel streaming upload engine + upload/sync hardening
- Route desktop uploads through the streaming core
- Docs overhaul — tree sidebar, site-wide search, new pages
- Animated theme toggle and smoother switch transition
- Client-facing repo deactivate endpoint for pool rotation
- Cooperative cancellation for foreground transfers
- Wire client repo rotation to the deactivate endpoint
- Cancellable transfers via cancel_transfer command
- Wire desktop transfer cancellation to Cancel
- Type-aware promise-safety lint as ratcheted inspect scan
- Nightly encrypted offsite Neon backup
- Fully automated Neon quota rotation with health-gated cutover
- Nudge search engines to recrawl after content deploys

### Changed

- Adopt TanStack Query as the source of truth for server-state
- Extract shared bounded-concurrency, chunk-decrypt & http-error helpers
- Extract shared features/vs page primitives
- Drop dead components and prune the icon barrel
- Tidy UI primitives, touch hooks and deps
- Centralize shared utils (date/clipboard/id/ttl/async) and dedupe pipeline helpers
- Extract shared tool-page components for pad/send/transfer + token viewer
- Share auth form chrome, error boundaries, and legal-page layout
- Adopt central utils + shared components across files, admin, share and marketing
- Finish adopting shared click-outside, share-link, and platform utils
- Adopt central platform map in analytics, vault, and upload views
- Move scroll-reveal off framer-motion, drop unneeded use-client boundaries
- Fetch latest release server-side for download page
- Replace div-soup with semantic ul/li/article/nav
- Replace framer-motion marquee/underline/timeline animations with CSS
- Typed PlatformId registry + shared PlatformIcon
- Consolidate duplicated storage-platform data into lib/platforms
- Trim unused radix sub-part exports
- Share entry dispatch and prop types
- Shared sweep-progress + blob-decode scaffold
- Extract fullscreen/copy hooks + StepGrid shell
- Share public-link viewer chrome
- Shared load-error panel + guarded fetch
- Centralize chart theme, expiry & time helpers
- Adopt shared form fields
- Shared feature-page primitives
- Dedupe showcase chrome, vs links & nav
- Dedupe bulk file handlers and settle new-code lint
- Responsive grids, pagination, and an activity table
- Dedupe folder/file style handlers into one helper
- Native settings — two-pane desktop, grouped-list mobile
- Centralize marketing content into typed data modules
- Centralize the production origin in lib/site.ts

### Fixed

- Validate plan against configured plans
- Replace dead /pricing links with /features
- Surface all connected platforms incl. Telegram in usage views
- Correct inaccurate platform limit labels
- Bulk move/merge now moves every file, not just one
- Serialize chat detection so getUpdates stops conflicting
- Stop crash-loop on already-gone GitHub chunks
- Explain DM-only dead-end + log getUpdates contents
- Honest connect UX + working deep links + DM diagnostics
- Harden authz from security audit — owner-gated membership + anti-lockout re-key
- Reveal the file listing once the correct password is supplied
- Stop distorted squircle fallback in Safari/Firefox
- Time-box generation so one stuck file can't freeze the grid
- Hero gradient reaches the top of the screen
- Surface platform unreachability instead of silently failing
- Upload resume counts staged chunks; reject duplicates early
- Mobile picker actually works + batches stop serializing
- Stop perpetual shimmer on freshly uploaded files
- Stop silent upload hangs + add retry to up/downloads
- Keep the transfer dock visible during active/failed work
- Retry transient failures on bulk + share downloads too
- Dismiss no longer destroys an upload; keep incompletes 7 days
- Honest upload %, natural expiry label, no iOS input zoom
- Telegram-first routing, server-side resume, platform chunk cleanup
- Pin resume to original platform, real pause, monotonic progress
- Retry transient failures instead of blacklisting until reload
- Toasts sit on the theme surface instead of a see-through wash
- Refresh token on chunk fetch, keep pause distinct from cancel, honest progress
- FAB clears the transfers dock, smaller iOS-safe button, sheet overlaps FAB
- Satisfy output:export with placeholder generateStaticParams
- Stop select-mode reflow flicker in the vault grid
- Distinct-count chunks, keep session on transient refresh, cap incomplete %
- Track play/pause intent so the next track auto-continues
- Dedupe + UNIQUE(file_id,idx), stop uploaded_chunks double-count; expose file platform
- Don't log out on a transient refresh failure at app load
- Render cached thumbnails instantly on reload
- Close blob-orphaning gaps in the durable upload/deletion path
- Verify hmac_v1 keyed hash in the client viewers, not plain SHA-256
- Make the lock genuine — evict decrypted thumbnails, add lock mask
- Correct effect dependency arrays
- Improve frontend linting and duplication checks for changed files
- Adjust main content class for better layout handling
- Verify HuggingFace chunks are retrievable before marking durable
- Time-box shimmer from first attempt and drop blank canvases
- Seed preview from the local file at upload time
- Truncate long file and folder names in share dialogs
- Correct the storage and rate limits shown per platform
- Give custom app backgrounds their own ambient set
- Make repo IDs globally unique to stop repos_pkey collisions
- Don't register the updater plugin without a config (launch crash)
- Desktop UX pass — keychain prompt, login, upload, thumbnails, decrypt, squircles
- Decrypt folder names, terminal thumbnail state, byos-direct on (desktop)
- Stop OS-notification spam on SSE reconnects
- Reliable DNS + resilient downloads (byos-direct→relay fallback)
- Stop Android silent launch crash
- Route desktop downloads through the core + Tools icon
- Bulk_download takes a passphrase PER file, not one for the batch
- Android login via opener plugin + enable in-app drag-drop
- Android safe-area, keyboard avoidance, and WebView smoothness
- Format JSON structure and ensure enabledPlugins section is correctly defined
- Exponential backoff for SSE reconnects
- Burn down type-aware promise-safety backlog
- Drive transactional email footer from FRONTEND_URL
- Drop View Transitions theme flip, make circuit bg CSS-driven
- Put the user toolchains back on PATH in prepush
- Clear govulncheck — Go 1.25.14, x/text v0.39.0
- Mark the settings platform refreshes as fire-and-forget

### Performance

- Use TanStack Query cache; stop focus-refetch; make folders shareable
- Cache file meta + share links; dedupe folder-subtree walk
- Decrypt + decompress in a Web Worker pool (off the main thread)
- Edge-to-edge shell, solid nav, no per-item list animation
- Ciphertext chunk cache + immutable cache headers on downloads
- Parallel decrypt pipeline, key memo, hover prefetch, progress
- Halve peak memory — incremental hash, no full-file copy
- Decouple file concurrency from CPU tier — fan out by network + batch size
- Batch bulk purge/restore and collapse chunk deletes into one commit
- Collapse bulk purge/restore into a single request
- Warm CEK cache for repeat file-key resolution

### Reverted

- Drop the surface-style + folder-shape experiment

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

