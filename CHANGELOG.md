# Changelog

All notable changes to zcrypt are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-11-10

### Added

- Recovery kit (Settings, Privacy): a key you keep that unlocks your vault if you forget your passphrase. The server stores only the passphrase sealed under that key and can't open it (format `rk1`, docs/CRYPTO_FORMAT.md 2.3)
- Desktop folder backup (Settings, Backup): folders you pick in the system folder dialog back up on their own, even with the vault locked, as files change or every night at a chosen time. Backups are sealed to the account public key (format `pk1`, docs/CRYPTO_FORMAT.md 2.2) and become normal vault files the next time a device unlocks. Nothing is deleted from the vault
- Android photo backup (Settings, Backup): photos and videos in DCIM, Pictures and Movies back up in the background with the app closed, as new ones arrive or every night, on Wi-Fi only, mobile data only, or either. The background job holds its own server session (`POST /api/auth/sessions/background`), which signing out ends
- Closing the desktop window keeps zcrypt running in the tray or menu bar (Quit zcrypt in the tray menu quits), and launch at login starts it hidden; the first folder backup asks once to allow this
- Music and video keep playing while you browse, in a mini player with picture-in-picture and system media controls; videos float in picture-in-picture when you leave the Android app
- Web Push alerts for new sign-ins, Space invites and opened share links, even with zcrypt closed, with a switch in Settings
- Web uploads to your own Telegram go straight from your browser to Telegram, so they skip our server, and fall back to going through it only when Telegram can't be reached
- A banner tells you when your network seems to block Telegram and suggests a VPN, in all eight languages
- Web transfers are limited to protect the server: one file up to 2 GB, and 20 GB of uploads and downloads through the server per month, starting over on the 1st (UTC). Direct uploads and the desktop app have no limit
- Settings, Storage shows a "Web transfers this month" meter with the date it resets
- Files over a web limit, or over the month's web transfers, now say why and offer an Open the desktop app button that falls back to a download when the app isn't installed
- `zcrypt://open` links bring the desktop app to the front, whether or not it is already running; a second launch focuses the running window instead of opening another
- The desktop app picks up storage you connected on the web, so desktop uploads go straight to your storage without connecting twice
- Admins see a heavy web transfer badge and a filter in the users list
- Upload whole folders from the browser: choose Upload a folder or drop a folder on the vault, and its folders are recreated inside the current one, names encrypted like any other folder. Uploading the same folder again fills it instead of making a copy, and system files like `.DS_Store` are left out (not on iPhone or in the desktop app yet)
- Settings, Appearance has a "Same theme on all my devices" switch. Your theme belongs to your account and follows you to every device you sign in on, a change shows up on your other devices straight away, and any device can keep its own theme instead. Custom colors sync too
- New self-hosting settings: `ZCRYPT_RELAY_MAX_FILE_BYTES`, `ZCRYPT_RELAY_MONTHLY_BYTES`, `ZCRYPT_RELAY_ALERT_DAILY_BYTES`, `ZCRYPT_SHARED_QUOTA_BYTES`, `ZCRYPT_MAX_UPLOAD_BYTES`, `ZCRYPT_SEND_ANON_DAILY_BYTES`, `ZCRYPT_SEND_USER_DAILY_BYTES`, `ZCRYPT_DB_MAX_CONNS`, `ZCRYPT_RELEASES_REPO`, `NEXT_PUBLIC_GITHUB_REPO` and `NEXT_PUBLIC_CONTACT_EMAIL`

### Changed

- Open the desktop app and Get the desktop app always try to open the app first, and open the download page in a new tab only when nothing opened, so an app installed after a missed attempt still opens
- Docs cover web limits, direct Telegram uploads, opening the desktop app, and every new server setting

### Fixed

- Reloading the web app no longer signs you out: the session cookie is first-party and site-wide, and a stale copy no longer ends the session
- Right-clicking a file shows its menu instead of opening the file
- Signing out of the desktop app stops its sync and backups and forgets the session it kept
- Share links and per-file pages are rendered per request instead of each URL being cached on its own
- Download counts on the site and in admin count people, not crawlers
- Docker builds never send a `.env` file into the image build
- Patched SQLite and zip in the Rust apps
- The site works on both the apex domain (zcrypt.cloud) and www: either is accepted for sign-in and API calls
- Desktop uploads straight to Telegram were being rejected by the server
- Full storage repositories could not be retired, so uploads kept pointing at them
- Switching accounts on the same device, for example in the desktop app, kept the previous account's theme and could save it as the new account's; each account now gets its own theme, or the default if it has none

## [0.2.0] - 2026-11-01

Full release notes: [docs/releases/0.2.0.md](docs/releases/0.2.0.md).

### Breaking

- The server refuses uploads that send a plaintext file name (HTTP 426 `client_update_required`); very old apps that don't seal file names must update before they can upload
- Self-hosted servers on Railway now read the client IP from `X-Real-IP`; behind any other proxy set `ZCRYPT_CLIENT_IP_HEADER` (or `none`)

### Added

- The whole app, website, docs, privacy and terms pages in eight languages: English, Arabic, German, Spanish, French, Russian, Urdu and Chinese
- System notifications on the web, desktop and Android for transfers, sign-in and full storage, with a Send a test button
- Optional sounds for finished, heads-up and problem moments, with three sound sets
- New transfers panel: failed items first, slim desktop bar, phone orb, drag files in to upload or out to download
- Public `/feedback` page with an optional reply email
- Account-change and announcement emails with one-click unsubscribe
- Spaces as real pages with their own links and keyboard control
- Recents and Starred views, one vault search in the top bar, and right-click menus on empty space
- Quick settings panel, Get the apps dialog with an Android QR code, and command palette actions
- Twelve new backgrounds and contrast-checked light and dark versions of custom themes
- Changelog pages for every version, an RSS feed and an in-app What's new dialog
- Connection status: the app says when you are offline, on a slow link, or our servers are down; `/api/health` reports maintenance
- One-line installers for macOS, Linux and Windows, a Homebrew tap, and a self-hosting kit for a Linux box behind a Cloudflare Tunnel
- Language suggestion based on the visitor's country, worked out on our own server
- Profile photos wherever an avatar appears
- Admin overview, one table for every admin list, bulk user actions and per-user reports (#46)

### Changed

- Upload and download progress in plain words, with a bar that never goes backwards and failures that say how to fix them
- One toast style everywhere; deletes and moves happen straight away with Undo instead of a confirm
- Confirmation dialogs name the count, preview what is affected and ask for a typed word before anything permanent
- Redesigned sign-in and sign-up pages, a drifting brand light and frosted-glass navigation across the site
- iOS-style switches in the theme color
- Calmer vault: one storage notice, storage ring in the sidebar, loading skeletons, friendlier empty states
- Cleaner phone and tablet layout
- Update dialog and GitHub release notes come from the curated changelog
- Deleting a user from the admin panel asks only for a 2FA code, and only when 2FA is on

### Fixed

- Big vaults no longer flicker or blank the page on weaker graphics chips
- Previews from an unreachable platform retry twice, then offer Try again
- A quick pause and resume no longer cancels a download; stopping a paused download stops it
- Resumed uploads return to the right folder; identical files in one batch upload one at a time
- Public links to files in password-protected folders open
- Android app opens its local vault in its own folder
- Desktop folder sync waits for files to settle and skips temporary files
- Pad and Send keep your input on retry; Transfer no longer reports done after a dropped connection
- Picking many photos on a phone keeps showing Preparing
- Emails carry a plain-text part, so they stop landing in spam
- Spaces ask you to unlock instead of failing, and space names stay readable after a key rotation
- System theme follows the device's light or dark switch straight away
- Landing-page switch styles no longer leak into real switches on public pages
- Clearer Spaces invite error for addresses without an account
- Sign-in sessions record the real client location instead of the proxy's

### Security

- Space names, the Send hash and every file name are sealed on your device; the app never sends a name or hash in the clear
- Account master key (mk1) envelope support, with a background migration, behind an admin switch
- Sharing keys are pinned per contact, with a warning if one changes
- Minimum passphrase length
- Content Security Policy enforced instead of report-only
- Sessions keep only a shortened IP; login records no longer store the typed email
- Previews from password-protected folders are never written to disk and are cleared on lock and sign-out
- Desktop app validates deep links, allowlists keychain keys, pins the sync origin and zeroizes the cached passphrase
- Server: ownership and limit checks on Send, folders, Pad, purge and 2FA; revocation survives restarts; transfer relay caps
- Storage platform tokens are scrubbed from error messages
- Dependency security updates: Go 1.26.10, rustls, rustls-webpki, zstd, zip, quinn-proto, DOMPurify, Next.js 16.4.3 (#40, #41, #42, #43, #44, #45, #47, #48, #49, #50)

## [0.1.7] - 2026-10-04

### Added

- Real update check instead of a false up to date
- Put pad, send and transfer on the site design
- Bug reports, reviews and stricter Spaces roles
- Guided tour, report a bug, reviews, redesigned Spaces and eight languages
- Move the language picker into the nav beside the theme toggle
- Use the translate icon for the language picker
- List only the admin's own platform tokens and count the rest
- Admin token panel shows own tokens, and nudge shared-storage users to connect their own
- Cap anonymous sends at 50 MB per file and 500 MB per day, delete on burn, and let an admin see and choose where Send files are stored
- Actionable health banner, Send storage panel, update pill, faster folder links, cross-tab sign-in sync, and drag-and-drop and blank-screen fixes

### Fixed

- Give shared files and folders their real names
- Stop pinning the first release lookup for the life of the server
- Transfer key off the relay, 2FA on every login, approved desktop OAuth, server-counted share downloads, drained shutdown (#23)
- Stop the hero window body going blank mid-scroll
- Color html so trackpad overscroll doesn't flash gray
- Tolerate legacy array token response so overview can't crash on deploy skew
- Version the overview query key so stale persisted snapshots are dropped
- Keep a rotated refresh token valid for 60s so racing clients don't log the user out
- One shared session for the engine and webview, and file uploads into the open folder
- Refresh through the desktop engine, upload into the open folder, one-click resume for this device's uploads
- 39 audit action items, desktop speed, and Next.js RCE patch (#30)
- Admin-only token sharing, own-account direct confirms, authz matrix test, and e2e repairs (#31)
- Replace a deleted storage repo and retry, let a burn-after-read link be read to the end, and accept sends up to 50 MB
- Seal file names and use a keyed content hash on desktop and Android uploads
- Satisfy the strict type check in the cross-tab refresh lock

### Performance

- Make the hero scroll smooth
- Cached, parallel vault loading and stale-while-revalidate pages
- Lighter hero, and run every quality gate in CI instead of on the laptop (#25)

## [0.1.6] - 2026-09-30

### Added

- Cap shared storage at 1 GiB per user
- Landing rebuild at /preview, plus the bugs it uncovered
- /preview v2, The Vault
- Four standalone landing prototypes under /prototype
- /preview-v2, the storage-first landing
- Write-freeze, refresh-token cookie, and a gated mock adapter
- Freeze writes during MASTER_KEY rotation, and test it
- Docker sandbox for k6, never touching Neon or real platforms
- Move Insights aggregation to the backend
- Redesign Insights page - date range, global KPI card, mobile carousel
- Add the missing Popover primitive
- Quick-filter popover, undo toast, drop-anywhere upload, inline rename, recently-viewed, bulk move/share
- Rebuild /preview-v2 as a product-first landing
- Make the product-first landing the homepage
- Share the layered folder and document tiles with the vault explorer
- Tighten the mobile tab bar into a native-feeling four-tab bar
- Give every marketing page the homepage's design language

### Changed

- Drop the em dashes from core, desktop and the Android activity
- Drop the em dashes from the app, styles and scripts

### Fixed

- MacOS updates resolved to a 404
- Deploy the backend from CI again
- Let Railway deploy, but make a missed deploy visible
- Restore the Go doc-comment form the de-dash pass broke
- Repair the neon-watch workflow the de-dash pass invalidated
- Stop Dependabot desktop builds dying on a secret they cannot have
- Show the welcome screen to everyone who has never seen it
- Freeze writes around the Neon dump-to-cutover window
- Stop persisting the refresh token in localStorage on the web
- Stop pinning pg_dump's major version, always use the newest
- Gate failures surfaced by the merge
- Raise the per-user analytics rate limit to a realistic ceiling
- Honest 429 messaging, from-scratch range calendar
- Satisfy the new-code lint gate on the analytics endpoints
- Wire Popover into the date-range control, drop dead exports
- Resolve new-code lint findings surfaced by the 3-branch merge
- Isolate golangci-lint's cache per checkout, not shared globally
- Stop the homepage flashing and replaying its entrance on load
- Render the hero window on the server instead of a placeholder
- Place the hero window before first paint
- Make web logout actually revoke the refresh cookie

### Performance

- Render marketing pages without the auth gate

## [0.1.5] - 2026-09-18

### Added

- Proxy /api on www.zcrypt.cloud as a stable front for native apps
- Editable profile and self-service password change
- Profile panel for name, avatar and password
- Turn on signed in-app updates
- App updates panel in Settings (desktop only)
- Confirm before changing a platform token's scope
- Confirm before applying plan config and removing vault members
- Stop storing plaintext filenames and exact IPs
- Seal the metadata that still reached the server in plaintext
- One stable download URL per platform, and count the installs
- Route downloads through /dl, add the downloads dashboards
- Show what the current release actually published
- Bound audit_events with a retention window

### Changed

- Share the token-scope confirmation between settings and admin
- Make safe-area insets testable off-device
- Stop exporting names nothing imports

### Fixed

- Install postgresql-client-17 for Neon dump/restore
- Move nightly DB backup to a private repo; fail the watcher when it's blind
- Stop baking a committed backend host into shipped builds
- Justify the image decoder imports, cover the new profile API wrappers
- Validate the password form as it is typed
- Start OAuth on the origin the callback returns to
- Stop the desktop keychain prompt by migrating the legacy device key
- Never lock in a ratchet baseline from a run with failed gates
- Check the errors the new handlers ignored, cover the new branches
- Stop the landing page rendering as empty voids
- Upload the Vercel build as one archive, not thousands of files
- Make zcrypt-core MIT, matching the rest of the project
- Stop serving a stale version when GitHub throttles us
- Stop depending on a broken Railway CLI for DB cutover
- Pass the required org id to neonctl project creation
- Export PATH for pg_dump 17, not just GITHUB_PATH
- Stop misdetecting phones as desktop OSes, surface native Linux packages
- Stop the updater lying to .deb/.rpm installs
- Generate the real app icon for Android builds
- Scope the updater permission to desktop, unbreaking Android builds
- Android ships the right icon and a real version; stable installer URLs
- External links do nothing in the app
- Cover the screen edges the safe-area work missed
- Safe-area insets survive an out-of-date system WebView
- Clean up what the download endpoint's own lint found
- Build on Go 1.26.6 and current x/crypto
- The edge-to-edge assertion was looking in the wrong place
- Build the Intel mac by cross-compiling, not on a runner that no longer exists
- Move off the hickory-proto line that has no patch

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

- Add 10 interactive bottom navigation bar samples
- Integrate Vercel Analytics and add .env.prod to gitignore
- Enhance upload pipeline integration tests with mock adapter and improved validation
- Implement unique X-Forwarded-For handling in integration tests
- Unified explorer, multi-format viewers, per-folder encryption, transfer manager
- In-memory decrypt cache with lock-aware eviction
- Cache + prefetch in the in-browser file decryptor
- Default grid view with selectable column density and reachable card actions
- Squircle logo mark, hero and showcase polish
- Add comparison page for zcrypt vs Proton Drive
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
- Premium UI overhaul — design system, auth layout, landing page, new pages
- Implement comprehensive file management with file table, sorting, selection, download, preview, and sharing capabilities.
- Implement comprehensive admin and user-facing features, including token management, audit logs, and new application pages.
- Implement core backend services for file management, authentication, user administration, and platform integration with initial frontend components.
- Introduce new sidebar component with user details, navigation, storage quota, and theme/logout functionality, along with new dashboard and analytics pages.
- Add initial marketing site with documentation pages, pricing, and SEO components including JSON-LD and sitemap.
- Introduce core application structure, backend services, and frontend UI for ZStash features including shared vaults, deadman, send, pad, and settings.
- Implement initial application structure with frontend UI, documentation, and backend services.
- Implement file upload, sharing, and download features with backend indexing and frontend components.

### Fixed

- Disable API rewrites in production to prevent Vercel private DNS error
- Security hardening — CORS whitelist, JWT alg validation, password complexity, auth rate limiting, filename validation, error sanitization, security headers
- Security hardening round 2 and code quality improvements

