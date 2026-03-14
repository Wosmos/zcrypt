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
  violet: "bg-violet-500/10 text-violet-500 dark:text-violet-400 ring-violet-500/20",
  rose: "bg-rose-500/10 text-rose-500 dark:text-rose-400 ring-rose-500/20",
};

// ─── How It Works Steps ──────────────────────────────────────

export const steps: Step[] = [
  { num: "01", title: "Drop a file", desc: "Drag and drop any file into your vault." },
  { num: "02", title: "We compress it", desc: "Smart compression makes it smaller." },
  { num: "03", title: "We encrypt it", desc: "Encrypted with your passphrase. Only you hold the key." },
  { num: "04", title: "We chunk it", desc: "Split into pieces, unrecognizable to anyone." },
  { num: "05", title: "Stored securely", desc: "Distributed across multiple storage platforms for safety." },
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
    quote: "Switched from Dropbox. Same 2TB, half the price, and my files are actually encrypted. No-brainer.",
    author: "Freelance Designer",
  },
  {
    quote: "The zero-knowledge architecture convinced our security team immediately. Open source sealed the deal.",
    author: "Senior Cloud Architect",
  },
  {
    quote: "I can point auditors to the source code. Client-side encryption, no server-side keys. Compliance loves it.",
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
    a: "Yes. Log into zcrypt from any modern browser, enter your passphrase, and access your encrypted files. Everything is decrypted locally in your browser.",
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
    desc: "Upload, download, and manage your vault from the terminal. Full TUI experience.",
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
    desc: "Encrypt and upload files with real-time progress. Download and decrypt in one step.",
  },
  {
    icon: "Search",
    title: "Browse Your Vault",
    desc: "Navigate your encrypted files with vim-style keys. Search, filter, and bulk-select.",
  },
  {
    icon: "HardDrive",
    title: "Multi-Platform",
    desc: "Connected to all your storage backends — GitHub, GitLab, Hugging Face.",
  },
  {
    icon: "Lock",
    title: "Encrypted Pipeline",
    desc: "Same military-grade encryption as the web app. Compress, encrypt, chunk — all local.",
  },
  {
    icon: "Settings",
    title: "Performance Profiles",
    desc: "Choose from light to ludicrous. Tune workers, chunk size, and compression level.",
  },
  {
    icon: "Shield",
    title: "2FA Support",
    desc: "Full two-factor authentication built in. Your account stays secure everywhere.",
  },
];

export const tuiInstallMethods = [
  {
    label: "Go Install",
    command: "go install github.com/zcrypt/zcrypt-tui@latest",
  },
  {
    label: "Build from source",
    command: "git clone https://github.com/zcrypt/zcrypt-tui && cd zcrypt-tui && go build -o zcrypt .",
  },
] as const;

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
    desc: "Create an account, set up your passphrase, and upload your first file in minutes.",
    href: null,
    comingSoon: true,
  },
  {
    icon: "Shield",
    title: "Security",
    desc: "How our encryption works, threat model, and security audit results.",
    href: null,
    comingSoon: true,
  },
  {
    icon: "Code",
    title: "API Reference",
    desc: "RESTful API documentation for building integrations with zcrypt.",
    href: null,
    comingSoon: true,
  },
  {
    icon: "Terminal",
    title: "Terminal App",
    desc: "Install and use the zcrypt TUI — a full terminal interface for your vault.",
    href: "/tui",
    comingSoon: false,
  },
  {
    icon: "HardDrive",
    title: "Self-Hosting",
    desc: "Deploy zcrypt on your own infrastructure with Docker.",
    href: null,
    comingSoon: true,
  },
  {
    icon: "Globe",
    title: "Platform Adapters",
    desc: "Configure GitHub, GitLab, and Hugging Face as storage backends.",
    href: null,
    comingSoon: true,
  },
];
