// ─── Centralized Static Data for Landing Page ────────────────
// All static content used across marketing/landing components.
// Icon references use string keys — map them in the consuming component.

// ─── Types ────────────────────────────────────────────────────

export interface PlanFeature {
  text: string;
  included: boolean;
}

export interface Plan {
  name: string;
  monthly: number;
  annual: number;
  desc: string;
  storage: string;
  maxFile: string;
  concurrent: string;
  features: PlanFeature[];
  highlight: boolean;
  badge: string | null;
  icon: string | null;
  socialProof?: string;
}

export interface Competitor {
  name: string;
  price: string;
  storage: string;
  zeroKnowledge: boolean;
  byob: boolean;
  openSource: boolean;
  highlight: boolean;
}

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

export interface Testimonial {
  quote: string;
  author: string;
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
  "2 TB for $9/mo",
  "Military-grade encryption",
  "Open source and auditable",
  "Cheaper than Dropbox",
  "10 GB free tier",
  "No hidden fees",
  "Your data stays private",
  "Use your own storage",
  "Multi-platform support",
  "Smart compression",
  "GDPR compliant",
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
    desc: "Use GitHub, GitLab, or Hugging Face as your storage backend.",
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
    desc: "Store across GitHub, GitLab, and Hugging Face. Your data stays portable and redundant.",
    accent: "cyan",
    large: false,
  },
  {
    icon: "Scissors",
    title: "Automatic Chunking",
    desc: "Large files are automatically split into encrypted chunks. No size limits.",
    accent: "rose",
    large: false,
  },
  {
    icon: "HeartHandshake",
    title: "Generous Free Tier",
    desc: "10 GB free with zero-knowledge encryption. No credit card required to start.",
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
    desc: "Distributed across multiple storage platforms for safety.",
  },
];

// ─── Pricing Plans ────────────────────────────────────────────

export const plans: Plan[] = [
  {
    name: "Free",
    monthly: 0,
    annual: 0,
    desc: "Get started with generous free storage.",
    storage: "10 GB",
    maxFile: "500 MB",
    concurrent: "2 uploads",
    features: [
      { text: "Zero-knowledge encryption", included: true },
      { text: "Multi-platform storage", included: true },
      { text: "5 shares per month", included: true },
      { text: "CLI access", included: false },
      { text: "BYOB (Bring Your Own Backend)", included: false },
    ],
    highlight: false,
    badge: null,
    icon: null,
  },
  {
    name: "Pro",
    monthly: 9,
    annual: 7,
    desc: "Maximum storage. Maximum freedom.",
    storage: "2 TB",
    maxFile: "25 GB",
    concurrent: "Unlimited",
    features: [
      { text: "Zero-knowledge encryption", included: true },
      { text: "Multi-platform storage", included: true },
      { text: "Unlimited shares", included: true },
      { text: "CLI access", included: true },
      { text: "BYOB (Bring Your Own Backend)", included: true },
    ],
    highlight: true,
    badge: "Most Popular",
    icon: "Crown",
    socialProof: "Chosen by 8 out of 10 paid users",
  },
  {
    name: "Plus",
    monthly: 4,
    annual: 3,
    desc: "For power users who need more space.",
    storage: "200 GB",
    maxFile: "5 GB",
    concurrent: "5 uploads",
    features: [
      { text: "Zero-knowledge encryption", included: true },
      { text: "Multi-platform storage", included: true },
      { text: "Unlimited shares", included: true },
      { text: "CLI access", included: true },
      { text: "BYOB (Bring Your Own Backend)", included: false },
    ],
    highlight: false,
    badge: null,
    icon: "Zap",
  },
];

// ─── Competitor Comparison ────────────────────────────────────

export const competitors: Competitor[] = [
  {
    name: "zcrypt Pro",
    price: "$9/mo",
    storage: "2 TB",
    zeroKnowledge: true,
    byob: true,
    openSource: true,
    highlight: true,
  },
  {
    name: "Dropbox Plus",
    price: "$12/mo",
    storage: "2 TB",
    zeroKnowledge: false,
    byob: false,
    openSource: false,
    highlight: false,
  },
  {
    name: "Google One",
    price: "$10/mo",
    storage: "2 TB",
    zeroKnowledge: false,
    byob: false,
    openSource: false,
    highlight: false,
  },
  {
    name: "Proton Drive",
    price: "$10/mo",
    storage: "500 GB",
    zeroKnowledge: true,
    byob: false,
    openSource: false,
    highlight: false,
  },
  {
    name: "Tresorit",
    price: "$14/mo",
    storage: "1 TB",
    zeroKnowledge: true,
    byob: false,
    openSource: false,
    highlight: false,
  },
];

// ─── Testimonials ─────────────────────────────────────────────

export const testimonials: Testimonial[] = [
  {
    quote:
      "Switched from Dropbox. Same 2TB, half the price, and my files are actually encrypted. No-brainer.",
    author: "Freelance Designer",
  },
  {
    quote:
      "The zero-knowledge architecture convinced our security team immediately. Open source sealed the deal.",
    author: "Senior Cloud Architect",
  },
  {
    quote:
      "I can point auditors to the source code. Client-side encryption, no server-side keys. Compliance loves it.",
    author: "Platform Engineer",
  },
];

// ─── FAQ ──────────────────────────────────────────────────────

export const faqs: FAQ[] = [
  {
    q: "How much storage do I get for free?",
    a: "The free tier includes 10 GB of zero-knowledge encrypted storage with up to 2 concurrent uploads. No credit card required. Upgrade to Plus ($4/mo) for 200 GB or Pro ($9/mo) for 2 TB.",
  },
  {
    q: "How secure is the encryption?",
    a: "We use AES-256-GCM, the cryptographic standard used by financial institutions globally. Your encryption keys are derived locally on your device and are never transmitted. This zero-knowledge architecture ensures that even we cannot access your files.",
  },
  {
    q: "What makes zcrypt cheaper than Dropbox or Google Drive?",
    a: "Our architecture is fundamentally different. We use Git-based distributed storage instead of expensive centralized infrastructure. This lets us offer 2 TB for $9/mo (vs $12 at Dropbox) while providing stronger encryption that competitors don't offer at any price.",
  },
  {
    q: "What is BYOB (Bring Your Own Backend)?",
    a: "Pro and Team users can connect their own GitHub, GitLab, or Hugging Face repositories as storage backends. Your data stays on infrastructure you fully control, with zcrypt handling the encryption and chunking.",
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
    icon: "Share2",
    title: "Encrypted Sharing",
    desc: "Share files with end-to-end encryption. Time-limited links. Password protection.",
    badge: "Q2 2026",
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
  "AES-256 Compliant",
  "Open Source",
  "GDPR Ready",
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

// ─── Docs Page Data ─────────────────────────────────────────

export interface DocsCategory {
  icon: string;
  title: string;
  desc: string;
  href: string | null;
  comingSoon: boolean;
}

export const docsCategories: DocsCategory[] = [
  {
    icon: "Rocket",
    title: "Getting Started",
    desc: "Walk through account setup, passphrase creation, connecting a storage platform, and uploading your first encrypted file from the web dashboard.",
    href: "/docs/getting-started",
    comingSoon: false,
  },
  {
    icon: "Shield",
    title: "Security",
    desc: "Deep dive into our AES-256-GCM encryption, zero-knowledge architecture, key derivation, threat model, and how your data stays private at every step.",
    href: "/docs/security",
    comingSoon: false,
  },
  {
    icon: "Zap",
    title: "Tools",
    desc: "Learn about built-in tools like Send for one-time file sharing, Pad for encrypted notes, Transfer for cross-device file moves, and integrity checks.",
    href: "/docs/tools",
    comingSoon: false,
  },
  {
    icon: "Bell",
    title: "Dead Man's Switch",
    desc: "Automatically notify a trusted contact if you stop checking in. Configurable timeout from 7 to 365 days with custom messages.",
    href: "/docs/dead-mans-switch",
    comingSoon: false,
  },
  {
    icon: "Eye",
    title: "Decoy Profile",
    desc: "Create a fake vault with a decoy password for plausible deniability. Show innocent-looking files when forced to log in.",
    href: "/docs/decoy-profile",
    comingSoon: false,
  },
  {
    icon: "FileText",
    title: "Encrypted Notes",
    desc: "End-to-end encrypted notepad with tags, pinning, and full-text search. Everything is encrypted in your browser before it reaches the server.",
    href: "/docs/encrypted-notes",
    comingSoon: false,
  },
  {
    icon: "Users",
    title: "Shared Vaults",
    desc: "Create collaborative file vaults and invite other users with role-based access control. Viewer, editor, and admin permissions.",
    href: "/docs/shared-vaults",
    comingSoon: false,
  },
  {
    icon: "Crown",
    title: "Plans and Limits",
    desc: "Compare Free, Plus, and Pro plans. Storage quotas, file size limits, concurrent uploads, and feature availability.",
    href: "/docs/plans",
    comingSoon: false,
  },
  {
    icon: "Terminal",
    title: "Terminal App",
    desc: "Install the zcrypt TUI to upload, download, and manage your vault directly from the command line with vim-style navigation and real-time progress.",
    href: "/tui",
    comingSoon: false,
  },
  {
    icon: "Globe",
    title: "Platform Adapters",
    desc: "Connect GitHub, GitLab, or Hugging Face as storage backends. Manage tokens, configure repo pools, and control how encrypted chunks are distributed.",
    href: "/docs/platform-adapters",
    comingSoon: false,
  },
  {
    icon: "Cog",
    title: "Advanced Usage",
    desc: "Snapshots, integrity verification, expiring files, device management, analytics dashboard, and bulk operations.",
    href: "/docs/advanced",
    comingSoon: false,
  },
  {
    icon: "HardDrive",
    title: "Self-Hosting",
    desc: "Run your own zcrypt instance with Docker. Full control over your backend, database, and storage for teams with strict compliance requirements.",
    href: null,
    comingSoon: true,
  },
  {
    icon: "Code",
    title: "API Reference",
    desc: "Complete REST API documentation covering authentication, file operations, vault management, and webhooks for building custom integrations with zcrypt.",
    href: null,
    comingSoon: true,
  },
];
