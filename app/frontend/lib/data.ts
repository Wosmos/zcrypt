// ─── Centralized Static Data for Landing Page ────────────────
// All static content used across marketing/landing components.
// Icon references use string keys. Map them in the consuming component.

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
  flag?: string;
}

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
    desc: "Every line of code is public. Don't trust us. Verify it yourself.",
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
    desc: "Your encryption keys never leave your device. We cannot access your data. That's by design.",
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
    icon: "Heart",
    title: "Free and Open Source",
    desc: "zcrypt is free and open source. Bring your own storage account and keep full control of your data.",
    accent: "cyan",
    large: false,
  },
];

export const accentColors: Record<string, string> = {
  cyan: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 ring-cyan-500/20",
  amber: "bg-amber-500/10 text-amber-500 dark:text-amber-400 ring-amber-500/20",
  violet: "bg-violet-500/10 text-violet-500 dark:text-violet-400 ring-violet-500/20",
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
    q: "Is it really free?",
    a: "Yes. There are no paid plans and no card. Your files live in accounts you already own, so there's nothing for us to charge for.",
  },
  {
    q: "How can there be no limit?",
    a: "zcrypt doesn't keep your files. Your connected accounts do. Every account you add is more room, and Telegram has no ceiling at all. New accounts start with 1 GB of shared space while you set things up.",
  },
  {
    q: "Can you see my files?",
    a: "No. Files are locked on your own device before they're uploaded, and so are their names. We only know where the pieces went, never what's in them.",
  },
  {
    q: "What if I forget my password?",
    a: "Then nobody can open your files, including us. That's what real privacy costs, so keep it in a password manager.",
  },
  {
    q: "Do I need a GitHub or Telegram account?",
    a: "Not to start. You can upload right away. Connect an account whenever you want more room. Telegram is the easiest if you already use it.",
  },
  {
    q: "Can I share with someone who doesn't use zcrypt?",
    a: "Yes. Send them a link. You can add a password, an end date and a download limit, or use Send to make a file that disappears after one read.",
  },
  {
    q: "Does it work on iPhone?",
    a: "The website does, in Safari. There's no iPhone app yet. There are apps for Mac, Windows, Linux, and Android (beta).",
  },
  {
    q: "What if a platform removes my files?",
    a: "Then the pieces stored there are gone from there. For anything you can't lose, keep a second copy somewhere else too. That's good advice for every cloud, this one included.",
  },
  {
    q: "What happens if zcrypt shuts down?",
    a: "Every line of zcrypt is public, so anyone can run it, including you. Once you connect your own accounts, your pieces sit there, not with us. Files in the 1 GB starter space live on a shared account, so if I ever wind it down, I'll say so well ahead of time and you can download everything.",
    flag: "shutdown",
  },
  {
    q: "Is it open source?",
    a: "Every line, under the MIT license. Read it, poke at it, or run the whole thing yourself with docker build and docker run.",
  },
];

// ─── Platform / Architecture Facts ───────────────────────────
// Single source of truth for facts that get restated across marketing and
// docs pages (desktop engine, per-platform shipping status). Update here
// when the underlying architecture changes and every page that imports it
// stays in sync. See docs/DESKTOP_ARCHITECTURE.md for the full detail.

export const desktopEngine = {
  name: "zcrypt-core",
  language: "Rust",
  replaces: "a Go sidecar subprocess",
  why: "A subprocess is impossible on iOS (Apple forbids child processes in app sandboxes); an in-process Rust engine runs identically on desktop, Android, and iOS.",
  dataPlane:
    "BYOS-direct: desktop and mobile upload straight to the user's own GitHub, GitLab, Hugging Face, or Telegram account using credentials from the OS keychain, so the backend never touches the platform token. The web app is the exception, because browser sandboxing blocks direct platform access, so it relays ciphertext through the backend.",
} as const;

// ─── Landing Page Section Copy ───────────────────────────────
// Plain-string prose for the landing page sections, extracted so the copy
// lives in one place. Headings that embed JSX (emphasis, animated underlines)
// stay inline in the page. Only their surrounding plain text is here.

export const landingSections = {
  cta: {
    eyebrow: "Get started today",
    subtext:
      "Connect your own account. Encrypted on your device. No artificial limits, no vendor lock-in.",
    button: "Start free",
  },
} as const;

// ─── Download Page Copy ──────────────────────────────────────
// Plain-string prose for the /download page sections. Headlines that embed
// JSX (the gradient span) and link-bearing footnotes stay inline in the page.

export const downloadPageContent = {
  hero: {
    badge: "Apps for every device",
    subtext:
      "Native desktop apps, an Android app, and a web app that needs no install. Same private drive everywhere, locked on your device before anything leaves it.",
    trustItems: [
      "Free & open source",
      "Only you can open your files",
      "No telemetry",
      "macOS · Windows · Linux",
    ],
  },
  desktop: {
    heading: "Desktop apps",
    subheading: `A native app built with Tauri, running ${desktopEngine.name}, the in-process ${desktopEngine.language} engine, so your files are encrypted on your device before they ever leave it.`,
  },
  android: {
    badge: "Android",
    heading: "On your phone, sideloaded",
    subheading:
      "Not on the Play Store, so grab the APK directly and install it yourself. Takes about a minute.",
  },
  web: {
    heading: "Prefer no install",
    body: "The full encrypted drive runs in any modern browser: folders, previews, sharing, and transfers. Everything is still encrypted on your device. Nothing to download.",
    cta: "Open the web app",
  },
  openSource: {
    heading: "Every build is open source",
    body: "Desktop, Android, and web, all built in the open from the same repository. Read the code, check the checksums, or build it yourself.",
    githubCta: "Source on GitHub",
    selfHostCta: "Self-host zcrypt",
  },
} as const;

// ─── Trust Bar ────────────────────────────────────────────────

export const trustBadges = ["AES-256-GCM encryption", "Zero-knowledge", "Open source"] as const;

// ─── Repo / releases ────────────────────────────────────────
// The /download page resolves actual download URLs at runtime from the latest
// GitHub release (see lib/releases.ts), so no versions/filenames live here.

export const GITHUB_REPO = "https://github.com/Wosmos/zcrypt";
export const RELEASES_URL = `${GITHUB_REPO}/releases`;

// ─── Docs Navigation ────────────────────────────────────────
// Single source of truth for the docs sidebar, the docs index grid, and the
// search index. Keep titles/desc accurate to what actually ships. Honest
// labels only. `badge: "Beta"` marks features that work but are still
// maturing; `badge: "Roadmap"` marks planned-but-not-shipped.

export interface DocsNavLink {
  title: string;
  href: string;
  desc: string;
  badge?: "Beta" | "Roadmap" | "New";
  /** External link. Render with a normal anchor. */
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
      {
        title: "Introduction",
        href: "/docs",
        desc: "What zcrypt is and how the encrypted drive works.",
      },
      {
        title: "Quickstart",
        href: "/docs/getting-started",
        desc: "Create an account, connect storage, and upload your first file.",
      },
      {
        title: "Core concepts",
        href: "/docs/concepts",
        desc: "Vault, passphrase, folders, chunks, and how they fit together.",
      },
      {
        title: "Connect your storage",
        href: "/docs/connect-storage",
        desc: "Link a GitHub, GitLab, Hugging Face, or Telegram account as your backend.",
      },
    ],
  },
  {
    title: "Organizing files",
    summary: "Folders, search, previews, and trash: the drive itself.",
    links: [
      {
        title: "Folders & the file explorer",
        href: "/docs/folders",
        desc: "Create, nest, rename, and navigate folders in the unified explorer.",
      },
      {
        title: "Moving & organizing",
        href: "/docs/organizing",
        desc: "Drag and drop, move-to-folder, and bulk actions.",
      },
      {
        title: "Search & filters",
        href: "/docs/search",
        desc: "Find files fast and filter by type.",
      },
      {
        title: "Viewing & previewing files",
        href: "/docs/viewing-files",
        desc: "Open images, video, audio, PDFs, docs, and code without downloading.",
      },
      {
        title: "Trash & restore",
        href: "/docs/trash",
        desc: "Soft-delete, restore, and permanently purge files.",
      },
    ],
  },
  {
    title: "Security",
    summary: "How the zero-knowledge encryption actually works.",
    links: [
      {
        title: "Encryption model",
        href: "/docs/security",
        desc: "AES-256-GCM, key derivation, and per-file keys.",
      },
      {
        title: "Zero-knowledge architecture",
        href: "/docs/zero-knowledge",
        desc: "What we store, and what we can never see.",
      },
      {
        title: "Per-folder encryption",
        href: "/docs/folder-encryption",
        desc: "How password-protected folders are re-keyed end to end.",
      },
      {
        title: "Passphrase & key management",
        href: "/docs/key-management",
        desc: "How your keys are derived and kept on your device.",
      },
      {
        title: "Threat model",
        href: "/docs/threat-model",
        desc: "What zcrypt protects against, and what it can't.",
      },
      {
        title: "Storage obfuscation",
        href: "/docs/obfuscation",
        desc: "Disguised filenames, commit messages, and repo names.",
      },
    ],
  },
  {
    title: "Storage backends",
    summary: "Bring your own storage and let it grow automatically.",
    links: [
      {
        title: "Bring your own storage",
        href: "/docs/platform-adapters",
        desc: "Connect GitHub, GitLab, Hugging Face, or Telegram, and manage tokens.",
      },
      {
        title: "Repo pool & rotation",
        href: "/docs/repo-pool",
        desc: "How your storage grows across repositories automatically.",
      },
    ],
  },
  {
    title: "Sharing & sending",
    summary: "Get files to other people and your other devices.",
    links: [
      {
        title: "Share links",
        href: "/docs/sharing",
        desc: "Share a file with an optional password, expiry, and download limit.",
      },
      {
        title: "Share a folder",
        href: "/docs/folder-sharing",
        desc: "One public link for a whole folder, read-only and still end-to-end encrypted.",
        badge: "New",
      },
      {
        title: "Anonymous Send",
        href: "/docs/send",
        desc: "Send an encrypted file without an account.",
      },
      { title: "Encrypted Pad", href: "/docs/pad", desc: "Share a one-time encrypted note." },
      {
        title: "Sync & device transfer",
        href: "/docs/sync-transfer",
        desc: "Offline pins, encrypted clipboard sync, folder sync, and device-to-device transfer.",
      },
    ],
  },
  {
    title: "Transfers",
    summary: "How files move in and out of your drive.",
    links: [
      {
        title: "How it works",
        href: "/docs/how-it-works",
        desc: "A file's journey: compress, encrypt, chunk, upload.",
      },
      {
        title: "Uploading",
        href: "/docs/uploading",
        desc: "Compression, encryption, chunking, and direct uploads.",
      },
      {
        title: "Downloading",
        href: "/docs/downloading",
        desc: "Fetching, decrypting, and streaming large files to disk.",
      },
      {
        title: "Transfer manager",
        href: "/docs/transfer-manager",
        desc: "Pause, resume, retry, and track every transfer.",
      },
      {
        title: "Bulk operations",
        href: "/docs/bulk",
        desc: "Download many files as a ZIP, or bulk-delete.",
      },
    ],
  },
  {
    title: "Privacy tools",
    summary: "Optional power features for high-stakes privacy.",
    links: [
      {
        title: "Decoy profile",
        href: "/docs/decoy-profile",
        desc: "A second password that opens an innocent-looking decoy vault.",
      },
      {
        title: "Dead man's switch",
        href: "/docs/dead-mans-switch",
        desc: "Notify a trusted contact if you stop checking in.",
      },
      {
        title: "Snapshots & integrity",
        href: "/docs/snapshots-integrity",
        desc: "Point-in-time manifests and tamper detection.",
        badge: "Beta",
      },
      {
        title: "Timed vaults",
        href: "/docs/timed-vaults",
        desc: "Group files under a countdown; expiry flags the vault without deleting files.",
        badge: "Beta",
      },
      {
        title: "Shared vaults",
        href: "/docs/shared-vaults",
        desc: "End-to-end encrypted spaces: named members, per-member key grants, and revocation.",
        badge: "Beta",
      },
    ],
  },
  {
    title: "Account",
    summary: "Sign-in, two-factor, and recovery.",
    links: [
      {
        title: "Authentication & 2FA",
        href: "/docs/authentication",
        desc: "Sign-in, sessions, password rules, and TOTP two-factor.",
      },
      {
        title: "Sign in with Google or GitHub",
        href: "/docs/oauth",
        desc: "Link and use OAuth providers.",
      },
      {
        title: "Account recovery",
        href: "/docs/recovery",
        desc: "What is and isn't recoverable, and why.",
      },
    ],
  },
  {
    title: "Apps",
    summary: "zcrypt on the web, desktop, and Android.",
    links: [
      { title: "Web app", href: "/docs/web-app", desc: "Use zcrypt in any modern browser." },
      {
        title: "Desktop app",
        href: "/docs/desktop-app",
        desc: "The native desktop build for macOS, Windows, and Linux.",
      },
      {
        title: "Android app",
        href: "/docs/android-app",
        desc: "Sideload the APK, same zero-knowledge core as desktop.",
        badge: "Beta",
      },
    ],
  },
  {
    title: "Developers",
    summary: "Self-host, integrate, and understand the internals.",
    links: [
      {
        title: "Self-hosting",
        href: "/docs/self-hosting",
        desc: "Run your own zcrypt instance with Docker.",
      },
      {
        title: "API reference",
        href: "/docs/api",
        desc: "REST endpoints, authentication, and the SSE event stream.",
      },
      {
        title: "Architecture",
        href: "/docs/architecture",
        desc: "How the pipeline, adapters, and services fit together.",
      },
      {
        title: "Tech stack & infrastructure",
        href: "/docs/tech-stack",
        desc: "The languages, frameworks, and hosting that run zcrypt.",
      },
      {
        title: "Contributing",
        href: "/docs/contributing",
        desc: "Build the project, pass the pre-push gate, and open a PR.",
      },
      {
        title: "License",
        href: "/docs/license",
        desc: "zcrypt is MIT-licensed. What that means for you.",
      },
    ],
  },
  {
    title: "Reference",
    summary: "Quick answers and definitions.",
    links: [
      { title: "FAQ", href: "/docs/faq", desc: "Common questions, answered plainly." },
      {
        title: "Troubleshooting",
        href: "/docs/troubleshooting",
        desc: "Fixes for the most common issues.",
      },
      { title: "Glossary", href: "/docs/glossary", desc: "Terms used across zcrypt, defined." },
    ],
  },
];

// ─── Features Index ──────────────────────────────────────────
// Single source for the /features index cards AND the site search index
// (lib/docs-search-index.ts). Icon is a string key, mapped in the
// consuming component, same convention as bentoFeatures/features above.

export interface FeaturesNavLink {
  href: string;
  icon: string;
  title: string;
  desc: string;
}

export const featuresNav: FeaturesNavLink[] = [
  {
    href: "/features/encrypted-drive",
    icon: "HardDrive",
    title: "Encrypted drive",
    desc: "A real file explorer: folders, grid/list, search, sort, all encrypted on your device.",
  },
  {
    href: "/features/folders",
    icon: "FolderOpen",
    title: "Encrypted folders",
    desc: "Nestable folders with encrypted names, plus a separate password for any folder.",
  },
  {
    href: "/features/file-viewers",
    icon: "Eye",
    title: "File viewers",
    desc: "Preview images, video, audio, PDFs, documents, and code, decrypted locally.",
  },
  {
    href: "/features/sharing",
    icon: "Share2",
    title: "Sharing",
    desc: "Share links with an optional password, expiry, and limits. The key stays in the URL.",
  },
  {
    href: "/features/encryption",
    icon: "Lock",
    title: "Zero-knowledge encryption",
    desc: "AES-256-GCM on your device. The server only ever sees ciphertext.",
  },
  {
    href: "/features/bring-your-own-storage",
    icon: "RefreshCcw",
    title: "Bring your own storage",
    desc: "Use GitHub, GitLab, Hugging Face, or Telegram. Your data, no lock-in.",
  },
  {
    href: "/features/transfers",
    icon: "Send",
    title: "Transfer manager",
    desc: "Pause, resume, retry, and track every upload and download in one place.",
  },
  {
    href: "/features/privacy",
    icon: "Shield",
    title: "Privacy tools",
    desc: "Decoy profile and dead man's switch, with their real limits spelled out.",
  },
  {
    href: "/features/apps",
    icon: "Monitor",
    title: "Web, desktop & Android",
    desc: "The same zero-knowledge core across every surface, including a Rust-powered Android app.",
  },
];
