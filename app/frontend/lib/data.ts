// ─── Centralized Static Data for Landing Page ────────────────
// All static content used across marketing/landing components.
// Icon references use string keys — map them in the consuming component.

// ─── Types ────────────────────────────────────────────────────

export interface BentoFeature {
  title: string;
  desc: string;
  icon: string;
  span: string;
  bg: string;
}

export interface Feature {
  icon: string;
  title: string;
  desc: string;
  accent: string;
  large: boolean;
}

export interface Step {
  num: string;
  title: string;
  desc: string;
}

export interface FAQ {
  q: string;
  a: string;
}

export interface RoadmapItem {
  icon: string;
  title: string;
  desc: string;
  badge: string;
}

// ─── Marquee ──────────────────────────────────────────────────

export const marqueeItems = [
  "Real folders & file explorer",
  "Preview any file — still encrypted",
  "Per-folder passwords",
  "Zero-knowledge — we can't read your files",
  "AES-256-GCM encryption",
  "Your own storage accounts",
  "No artificial limits",
  "Open source",
  "Trash & restore",
  "Pause & resume uploads",
  "Terminal app available",
] as const;

// ─── Bento Grid Features ─────────────────────────────────────

export const bentoFeatures: BentoFeature[] = [
  {
    title: "Truly Private",
    desc: "Files are encrypted on your device before they leave. We never see your data.",
    icon: "Shield",
    span: "md:col-span-2",
    bg: "from-cyan-500/10",
  },
  {
    title: "Lightning Fast",
    desc: "Large files upload in parallel, compressed and encrypted in seconds.",
    icon: "Zap",
    span: "md:col-span-1",
    bg: "from-amber-500/10",
  },
  {
    title: "Nothing Leaves Unencrypted",
    desc: "Encryption and decryption happen on your device. Always.",
    icon: "Lock",
    span: "md:col-span-1",
    bg: "from-blue-500/10",
  },
  {
    title: "Store Anywhere",
    desc: "Use GitHub, GitLab, Hugging Face, or Telegram as your storage backend.",
    icon: "HardDrive",
    span: "md:col-span-1",
    bg: "from-purple-500/10",
  },
  {
    title: "Use Your Own Storage",
    desc: "Connect your own repositories. Your data, your infrastructure.",
    icon: "RefreshCcw",
    span: "md:col-span-1",
    bg: "from-rose-500/10",
  },
  {
    title: "Open Source",
    desc: "Every line of code is public. Don't trust us — verify it yourself.",
    icon: "Globe",
    span: "md:col-span-2",
    bg: "from-cyan-500/10",
  },
];

// ─── Page Features (Security Section) ─────────────────────────

export const features: Feature[] = [
  {
    icon: "Lock",
    title: "AES-256-GCM Encryption",
    desc: "Industry-standard symmetric encryption protects every file before it leaves your device.",
    accent: "cyan",
    large: true,
  },
  {
    icon: "Eye",
    title: "Zero-Knowledge Architecture",
    desc: "Your encryption keys never leave your device. We cannot access your data — by design.",
    accent: "violet",
    large: true,
  },
  {
    icon: "Zap",
    title: "Zstd Compression",
    desc: "High-performance compression reduces file size before encryption, saving storage.",
    accent: "amber",
    large: false,
  },
  {
    icon: "GitBranch",
    title: "Multi-Platform Storage",
    desc: "Connect GitHub, GitLab, Hugging Face, or Telegram as your storage backend. Each file is stored on one platform, with automatic same-platform repo rotation as repos fill up.",
    accent: "cyan",
    large: false,
  },
  {
    icon: "Scissors",
    title: "Automatic Chunking",
    desc: "Large files are automatically split into encrypted chunks for fast, resumable uploads.",
    accent: "rose",
    large: false,
  },
  {
    icon: "HeartHandshake",
    title: "Free and Open Source",
    desc: "zcrypt is free and open source. Bring your own storage account and keep full control of your data.",
    accent: "cyan",
    large: false,
  },
];

export const accentColors: Record<string, string> = {
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 ring-cyan-500/20",
  amber: "bg-amber-500/10 text-amber-500 dark:text-amber-400 ring-amber-500/20",
  violet:
    "bg-violet-500/10 text-violet-500 dark:text-violet-400 ring-violet-500/20",
  rose: "bg-rose-500/10 text-rose-500 dark:text-rose-400 ring-rose-500/20",
};

// ─── How It Works Steps ──────────────────────────────────────

export const steps: Step[] = [
  {
    num: "01",
    title: "Drop a file",
    desc: "Drag and drop any file into your vault.",
  },
  {
    num: "02",
    title: "We compress it",
    desc: "Smart compression makes it smaller.",
  },
  {
    num: "03",
    title: "We encrypt it",
    desc: "Encrypted with your passphrase. Only you hold the key.",
  },
  {
    num: "04",
    title: "We chunk it",
    desc: "Split into pieces, unrecognizable to anyone.",
  },
  {
    num: "05",
    title: "Stored securely",
    desc: "Encrypted chunks are uploaded to your connected storage platform.",
  },
];

// ─── FAQ ──────────────────────────────────────────────────────

export const faqs: FAQ[] = [
  {
    q: "How much does zcrypt cost?",
    a: "zcrypt is free and open source. There are no paid plans. You connect your own storage account, so your available space is bounded only by that platform's free space — not by us.",
  },
  {
    q: "How much storage do I get?",
    a: "You bring your own storage. Connect your GitHub, GitLab, Hugging Face, or Telegram account and your capacity is whatever free space that platform gives you. zcrypt handles the encryption and chunking on top of it.",
  },
  {
    q: "How secure is the encryption?",
    a: "We use AES-256-GCM. Your encryption keys are derived locally on your device and are never transmitted. This zero-knowledge architecture ensures that even we cannot access your files.",
  },
  {
    q: "What is BYOB (Bring Your Own Backend)?",
    a: "BYOB is the core of how zcrypt works: you connect your own GitHub, GitLab, Hugging Face, or Telegram account as the storage backend. Your encrypted data lives on infrastructure you control, and zcrypt handles the encryption and chunking. Because it's your account, your storage is bounded only by that platform's free space.",
  },
  {
    q: "Does zcrypt have real folders, or just a flat file list?",
    a: "Real folders. zcrypt is a full encrypted drive: create and nest folders, drag files to organize them, search, sort, and switch between grid and list views. Folder names are encrypted too, so even your structure stays private.",
  },
  {
    q: "Can I preview files without downloading them?",
    a: "Yes. zcrypt previews images, video, audio, PDFs, documents (DOCX), Markdown, CSVs, and source code directly in the browser. Each file is decrypted on the fly on your device — the plaintext never touches our servers.",
  },
  {
    q: "Can I password-protect a single folder?",
    a: "Yes. Any folder can have its own password, separate from your account passphrase. The files inside are re-encrypted under that folder's key, so even with your vault unlocked, a protected folder stays sealed until you enter its password.",
  },
  {
    q: "Can I access my files across multiple devices?",
    a: "Yes. Log into zcrypt from any modern browser or the terminal app (TUI), enter your passphrase, and access your encrypted files. Everything is decrypted locally on your device.",
  },
  {
    q: "Is there a command-line or terminal app?",
    a: "Yes. The zcrypt TUI is a full terminal interface built with Go. Upload, download, search, and manage your vault with vim-style keys and real-time progress. Install it with: go install github.com/zcrypt/zcrypt-tui@latest",
  },
  {
    q: "What happens if I forget my passphrase?",
    a: "Because zcrypt is strictly zero-knowledge, your passphrase is never stored on our servers. If you lose it, your encrypted files cannot be recovered by anyone. We strongly recommend using a password manager.",
  },
];

// ─── Roadmap ──────────────────────────────────────────────────

export const roadmapItems: RoadmapItem[] = [
  {
    icon: "Terminal",
    title: "Terminal App",
    desc: "Full terminal interface with vim-style navigation, real-time progress, command mode, and four performance profiles. Built with Go.",
    badge: "Available now",
  },
  {
    icon: "Smartphone",
    title: "Mobile App",
    desc: "iOS and Android apps with offline access and camera backup. Your vault in your pocket.",
    badge: "Q3 2026",
  },
  {
    icon: "Image",
    title: "Photo Gallery",
    desc: "Browse your encrypted photos with a beautiful gallery view. Private photo backup.",
    badge: "Q3 2026",
  },
];

// ─── Trust Bar ────────────────────────────────────────────────

export const trustBadges = [
  "AES-256-GCM encryption",
  "Zero-knowledge",
  "Open source",
] as const;

// ─── TUI Page Data ──────────────────────────────────────────

export interface TUIFeature {
  icon: string;
  title: string;
  desc: string;
}

export const tuiFeatures: TUIFeature[] = [
  {
    icon: "Upload",
    title: "Upload & Download",
    desc: "Encrypt and upload files with real-time progress tracking — chunks, bytes, speed. Download and decrypt in one step.",
  },
  {
    icon: "Search",
    title: "Vim-Style File Browser",
    desc: "Search with /, bulk-select with space, jump with g/G, and run commands with :. Feels like home.",
  },
  {
    icon: "HardDrive",
    title: "Multi-Platform Storage",
    desc: "See connection status for GitHub, GitLab, and Hugging Face right from settings. Your backends, at a glance.",
  },
  {
    icon: "Lock",
    title: "Full Encryption Pipeline",
    desc: "Same zero-knowledge pipeline as the web app — compress with zstd, encrypt with AES-256-GCM, chunk, and upload. All on your machine.",
  },
  {
    icon: "Gauge",
    title: "Performance Profiles",
    desc: "Four tunable profiles from Light (2 workers, 4 MB chunks) to Ludicrous (all CPU cores, 32 MB chunks). Pick your speed.",
  },
  {
    icon: "Shield",
    title: "2FA Built In",
    desc: "Full TOTP two-factor authentication. Secure your account with any authenticator app, right from the terminal.",
  },
  {
    icon: "Terminal",
    title: "Command Mode",
    desc: "Press : for vim-style commands — upload, download, delete, search, select-all, and more. Power at your fingertips.",
  },
  {
    icon: "Cpu",
    title: "Single Binary, Zero Dependencies",
    desc: "One ~8 MB binary. No runtime, no browser, no Electron. Runs on any machine with a terminal — including headless servers over SSH.",
  },
];

export interface TUIShortcut {
  keys: string;
  action: string;
}

export const tuiShortcuts: TUIShortcut[] = [
  { keys: "Arrow keys", action: "Navigate up / down" },
  { keys: "g / G", action: "Jump to top / bottom" },
  { keys: "space", action: "Toggle file selection" },
  { keys: "Shift+J/K", action: "Range select" },
  { keys: "Ctrl+a", action: "Select / deselect all" },
  { keys: "u", action: "Upload a file" },
  { keys: "d / Enter", action: "Download selected" },
  { keys: "x / Delete", action: "Delete selected" },
  { keys: "/", action: "Search files" },
  { keys: ":", action: "Command mode" },
  { keys: "r", action: "Refresh vault" },
  { keys: "s", action: "Open settings" },
];

export interface TUICommand {
  cmd: string;
  desc: string;
}

export const tuiCommands: TUICommand[] = [
  { cmd: ":upload [path]", desc: "Upload a file (optionally pre-fill path)" },
  { cmd: ":dl", desc: "Download the selected file" },
  { cmd: ":rm", desc: "Delete selected files" },
  { cmd: ":search [term]", desc: "Filter files by name" },
  { cmd: ":select-all", desc: "Select all visible files" },
  { cmd: ":clear", desc: "Clear search and deselect" },
  { cmd: ":settings", desc: "Open settings screen" },
  { cmd: ":logout", desc: "Sign out and return to login" },
  { cmd: ":help", desc: "Show available commands" },
];

export interface TUIProfile {
  name: string;
  workers: string;
  chunkSize: string;
  compression: string;
  desc: string;
}

export const tuiProfiles: TUIProfile[] = [
  {
    name: "Light",
    workers: "2",
    chunkSize: "4 MB",
    compression: "Level 1",
    desc: "Low resource usage. Great for background tasks or constrained machines.",
  },
  {
    name: "Normal",
    workers: "4",
    chunkSize: "10 MB",
    compression: "Level 2",
    desc: "Balanced speed and resource usage. The default for most users.",
  },
  {
    name: "Intense",
    workers: "8",
    chunkSize: "16 MB",
    compression: "Level 3",
    desc: "Fast uploads on powerful machines. Uses more CPU and memory.",
  },
  {
    name: "Ludicrous",
    workers: "All cores",
    chunkSize: "32 MB",
    compression: "Level 3",
    desc: "Maximum throughput. Uses every CPU core. For when speed is everything.",
  },
];

export const tuiInstallMethods = [
  {
    label: "Homebrew",
    command: "brew tap Wosmos/zcrypt && brew install zcrypt",
    note: "macOS / Linux",
  },
  {
    label: "npm / bun / yarn / pnpm",
    command: "npm i -g @zcrypt/cli",
    note: "All platforms",
  },
  {
    label: "Scoop",
    command: "scoop bucket add zcrypt https://github.com/Wosmos/scoop-zcrypt && scoop install zcrypt",
    note: "Windows",
  },
  {
    label: "Shell Script",
    command: "curl -fsSL https://zcrypt.cloud/install.sh | sh",
    note: "macOS / Linux",
  },
  {
    label: "Direct Download",
    command: "https://github.com/Wosmos/zcrypt/releases/latest",
    note: "All platforms — prebuilt binaries",
  },
  {
    label: "Build from Source",
    command:
      "git clone https://github.com/Wosmos/zcrypt.git && cd zcrypt/app/tui && go build -o zcrypt .",
    note: "Requires Go 1.25+",
  },
] as const;

// ─── Downloads ──────────────────────────────────────────────
// Single source of truth for the /download page. Asset filenames must match
// what the release workflows publish to the GitHub Release:
//   • Desktop installers  → .github/workflows/desktop.yml  (Tauri bundle)
//   • CLI / TUI binaries   → .github/workflows/release.yml  (GoReleaser)
// Bump the two version constants when a new release goes out — everything else
// is derived from them.

export const GITHUB_REPO = "https://github.com/Wosmos/zcrypt";
export const RELEASES_URL = `${GITHUB_REPO}/releases`;
export const LATEST_RELEASE_URL = `${RELEASES_URL}/latest`;

/** Tauri desktop bundle version (productName "zcrypt" in tauri.conf.json). */
export const DESKTOP_VERSION = "0.1.0";
/** GoReleaser CLI/TUI version. */
export const CLI_VERSION = "0.1.0";

const desktopAsset = (file: string) =>
  `${RELEASES_URL}/download/v${DESKTOP_VERSION}/${file}`;
const cliAsset = (file: string) =>
  `${RELEASES_URL}/download/v${CLI_VERSION}/${file}`;

export type PlatformId = "macos" | "windows" | "linux";

export interface DownloadOption {
  label: string;
  /** Short qualifier, e.g. "M1–M4 · .dmg". */
  sublabel: string;
  href: string;
  /** The build most people on this OS should pick. */
  recommended?: boolean;
}

export interface DesktopPlatform {
  id: PlatformId;
  name: string;
  blurb: string;
  options: DownloadOption[];
}

export const desktopPlatforms: DesktopPlatform[] = [
  {
    id: "macos",
    name: "macOS",
    blurb: "Apple Silicon, macOS 11 Big Sur or later.",
    options: [
      { label: "Apple Silicon", sublabel: "M1–M4 · .dmg", href: desktopAsset(`zcrypt_${DESKTOP_VERSION}_aarch64.dmg`), recommended: true },
    ],
  },
  {
    id: "windows",
    name: "Windows",
    blurb: "Windows 10 and 11, 64-bit.",
    options: [
      { label: "Installer", sublabel: "x64 · .exe", href: desktopAsset(`zcrypt_${DESKTOP_VERSION}_x64-setup.exe`), recommended: true },
      { label: "MSI package", sublabel: "x64 · .msi", href: desktopAsset(`zcrypt_${DESKTOP_VERSION}_x64_en-US.msi`) },
    ],
  },
  {
    id: "linux",
    name: "Linux",
    blurb: "64-bit. AppImage runs anywhere; deb/rpm for your package manager.",
    options: [
      { label: "AppImage", sublabel: "x86_64 · portable", href: desktopAsset(`zcrypt_${DESKTOP_VERSION}_amd64.AppImage`), recommended: true },
      { label: "Debian / Ubuntu", sublabel: "amd64 · .deb", href: desktopAsset(`zcrypt_${DESKTOP_VERSION}_amd64.deb`) },
      { label: "Fedora / RHEL", sublabel: "x86_64 · .rpm", href: desktopAsset(`zcrypt-${DESKTOP_VERSION}-1.x86_64.rpm`) },
    ],
  },
];

/** Prebuilt CLI/TUI binaries (GoReleaser) — live on the current release. */
export interface CliBinary {
  os: "macOS" | "Linux" | "Windows";
  arch: string;
  href: string;
}

export const cliBinaries: CliBinary[] = [
  { os: "macOS", arch: "Apple Silicon", href: cliAsset(`zcrypt_${CLI_VERSION}_darwin_arm64.tar.gz`) },
  { os: "macOS", arch: "Intel", href: cliAsset(`zcrypt_${CLI_VERSION}_darwin_amd64.tar.gz`) },
  { os: "Linux", arch: "amd64", href: cliAsset(`zcrypt_${CLI_VERSION}_linux_amd64.tar.gz`) },
  { os: "Linux", arch: "arm64", href: cliAsset(`zcrypt_${CLI_VERSION}_linux_arm64.tar.gz`) },
  { os: "Windows", arch: "amd64", href: cliAsset(`zcrypt_${CLI_VERSION}_windows_amd64.zip`) },
  { os: "Windows", arch: "arm64", href: cliAsset(`zcrypt_${CLI_VERSION}_windows_arm64.zip`) },
];

export const CHECKSUMS_URL = cliAsset("checksums.txt");

export interface TUIQuickStep {
  step: string;
  title: string;
  command?: string;
  desc: string;
}

export const tuiQuickStart: TUIQuickStep[] = [
  {
    step: "01",
    title: "Install",
    command: "brew install Wosmos/zcrypt/zcrypt",
    desc: "Install via Homebrew, npm, Scoop, or download from GitHub Releases.",
  },
  {
    step: "02",
    title: "Launch",
    command: "zcrypt",
    desc: "Open the TUI. Log in or create an account.",
  },
  {
    step: "03",
    title: "Upload",
    desc: "Press u, enter a file path and passphrase. Watch real-time progress as your file is compressed, encrypted, and uploaded.",
  },
  {
    step: "04",
    title: "Download",
    desc: "Select a file and press d. Enter your passphrase. The file is downloaded, decrypted, and saved locally.",
  },
];

// ─── Docs Navigation ────────────────────────────────────────
// Single source of truth for the docs sidebar, the docs index grid, and the
// search index. Keep titles/desc accurate to what actually ships — honest
// labels only. `badge: "Beta"` marks features that work but are still
// maturing; `badge: "Roadmap"` marks planned-but-not-shipped.

export interface DocsNavLink {
  title: string;
  href: string;
  desc: string;
  badge?: "Beta" | "Roadmap" | "New";
  /** External (e.g. the TUI marketing page) — render with a normal anchor. */
  external?: boolean;
}

export interface DocsNavGroup {
  title: string;
  /** Short one-liner shown under the group heading on the docs index. */
  summary: string;
  links: DocsNavLink[];
}

export const docsNav: DocsNavGroup[] = [
  {
    title: "Getting Started",
    summary: "Set up your encrypted drive and upload your first file.",
    links: [
      { title: "Introduction", href: "/docs", desc: "What zcrypt is and how the encrypted drive works." },
      { title: "Quickstart", href: "/docs/getting-started", desc: "Create an account, connect storage, and upload your first file." },
      { title: "Core concepts", href: "/docs/concepts", desc: "Vault, passphrase, folders, and chunks — and how they fit together." },
      { title: "Connect your storage", href: "/docs/connect-storage", desc: "Link a GitHub, GitLab, Hugging Face, or Telegram account as your backend." },
    ],
  },
  {
    title: "Organizing files",
    summary: "Folders, search, previews, and trash — the drive itself.",
    links: [
      { title: "Folders & the file explorer", href: "/docs/folders", desc: "Create, nest, rename, and navigate folders in the unified explorer." },
      { title: "Moving & organizing", href: "/docs/organizing", desc: "Drag and drop, move-to-folder, and bulk actions." },
      { title: "Search & filters", href: "/docs/search", desc: "Find files fast and filter by type." },
      { title: "Viewing & previewing files", href: "/docs/viewing-files", desc: "Open images, video, audio, PDFs, docs, and code without downloading." },
      { title: "Trash & restore", href: "/docs/trash", desc: "Soft-delete, restore, and permanently purge files." },
    ],
  },
  {
    title: "Security",
    summary: "How the zero-knowledge encryption actually works.",
    links: [
      { title: "Encryption model", href: "/docs/security", desc: "AES-256-GCM, key derivation, and per-file keys." },
      { title: "Zero-knowledge architecture", href: "/docs/zero-knowledge", desc: "What we store, and what we can never see." },
      { title: "Per-folder encryption", href: "/docs/folder-encryption", desc: "How password-protected folders are re-keyed end to end." },
      { title: "Passphrase & key management", href: "/docs/key-management", desc: "How your keys are derived and kept on your device." },
      { title: "Threat model", href: "/docs/threat-model", desc: "What zcrypt protects against — and what it can't." },
      { title: "Storage obfuscation", href: "/docs/obfuscation", desc: "Disguised filenames, commit messages, and repo names." },
    ],
  },
  {
    title: "Storage backends",
    summary: "Bring your own storage and let it grow automatically.",
    links: [
      { title: "Bring your own storage", href: "/docs/platform-adapters", desc: "Connect GitHub, GitLab, Hugging Face, or Telegram, and manage tokens." },
      { title: "Repo pool & rotation", href: "/docs/repo-pool", desc: "How your storage grows across repositories automatically." },
    ],
  },
  {
    title: "Sharing & sending",
    summary: "Get files to other people and your other devices.",
    links: [
      { title: "Share links", href: "/docs/sharing", desc: "Share a file with an optional password, expiry, and download limit." },
      { title: "Anonymous Send", href: "/docs/send", desc: "Send an encrypted file without an account." },
      { title: "Encrypted Pad", href: "/docs/pad", desc: "Share a one-time encrypted note." },
      { title: "Sync & device transfer", href: "/docs/sync-transfer", desc: "Encrypted clipboard sync and device-to-device transfer." },
    ],
  },
  {
    title: "Transfers",
    summary: "How files move in and out of your drive.",
    links: [
      { title: "How it works", href: "/docs/how-it-works", desc: "A file's journey: compress, encrypt, chunk, upload." },
      { title: "Uploading", href: "/docs/uploading", desc: "Compression, encryption, chunking, and direct uploads." },
      { title: "Downloading", href: "/docs/downloading", desc: "Fetching, verifying, and decrypting your files." },
      { title: "Transfer manager", href: "/docs/transfer-manager", desc: "Pause, resume, retry, and track every transfer." },
      { title: "Bulk operations", href: "/docs/bulk", desc: "Download many files as a ZIP, or bulk-delete." },
    ],
  },
  {
    title: "Privacy tools",
    summary: "Optional power features for high-stakes privacy.",
    links: [
      { title: "Decoy profile", href: "/docs/decoy-profile", desc: "A second password that opens an innocent-looking decoy vault." },
      { title: "Dead man's switch", href: "/docs/dead-mans-switch", desc: "Notify a trusted contact if you stop checking in." },
      { title: "Snapshots & integrity", href: "/docs/snapshots-integrity", desc: "Point-in-time manifests and tamper detection.", badge: "Beta" },
      { title: "Shared vaults", href: "/docs/shared-vaults", desc: "Collaborative vaults with role-based access.", badge: "Beta" },
    ],
  },
  {
    title: "Account",
    summary: "Sign-in, two-factor, and recovery.",
    links: [
      { title: "Authentication & 2FA", href: "/docs/authentication", desc: "Sign-in, sessions, password rules, and TOTP two-factor." },
      { title: "Sign in with Google or GitHub", href: "/docs/oauth", desc: "Link and use OAuth providers." },
      { title: "Account recovery", href: "/docs/recovery", desc: "What is and isn't recoverable — and why." },
    ],
  },
  {
    title: "Apps",
    summary: "zcrypt on the web, desktop, and terminal.",
    links: [
      { title: "Web app", href: "/docs/web-app", desc: "Use zcrypt in any modern browser." },
      { title: "Desktop app", href: "/docs/desktop-app", desc: "The native desktop build for macOS, Windows, and Linux." },
      { title: "Terminal app (TUI)", href: "/tui", desc: "Manage your vault from the command line.", external: true },
    ],
  },
  {
    title: "Developers",
    summary: "Self-host, integrate, and understand the internals.",
    links: [
      { title: "Self-hosting", href: "/docs/self-hosting", desc: "Run your own zcrypt instance with Docker." },
      { title: "API reference", href: "/docs/api", desc: "REST endpoints, authentication, and the SSE event stream." },
      { title: "Architecture", href: "/docs/architecture", desc: "How the pipeline, adapters, and services fit together." },
    ],
  },
  {
    title: "Reference",
    summary: "Quick answers and definitions.",
    links: [
      { title: "FAQ", href: "/docs/faq", desc: "Common questions, answered plainly." },
      { title: "Troubleshooting", href: "/docs/troubleshooting", desc: "Fixes for the most common issues." },
      { title: "Glossary", href: "/docs/glossary", desc: "Terms used across zcrypt, defined." },
    ],
  },
];
