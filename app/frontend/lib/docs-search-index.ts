// ─── Docs Search Index ──────────────────────────────────────
// Flat array of searchable entries extracted from all docs pages.
// Each entry has text content, a destination href, and tags for
// improved fuzzy matching (typo-tolerant via Fuse.js).

export interface SearchEntry {
  title: string;
  section: string;
  content: string;
  href: string;
  tags: string[];
}

export const docsSearchIndex: SearchEntry[] = [
  // ═══ Getting Started ═══
  {
    title: "Create your account",
    section: "Getting Started",
    content:
      "Head to zcrypt.cloud/register and create a free account with your email and a strong password. Verify your email. You get 10 GB of free encrypted storage immediately — no credit card required.",
    href: "/docs/getting-started",
    tags: [
      "register",
      "sign up",
      "signup",
      "account",
      "email",
      "free",
      "10 GB",
      "onboarding",
    ],
  },
  {
    title: "Set your passphrase",
    section: "Getting Started",
    content:
      "Your passphrase derives your encryption key locally on your device. It never leaves your browser. Choose something strong and memorable — if you lose it, your files cannot be recovered. Use a password manager.",
    href: "/docs/getting-started",
    tags: [
      "passphrase",
      "password",
      "encryption key",
      "key derivation",
      "forgot passphrase",
      "recovery",
      "zero knowledge",
    ],
  },
  {
    title: "Upload your first file",
    section: "Getting Started",
    content:
      "Drag a file onto the upload area or click to browse. Your file is automatically compressed with zstd, encrypted with AES-256-GCM, and split into chunks — all in your browser. Progress is shown in real-time via SSE.",
    href: "/docs/getting-started",
    tags: [
      "upload",
      "drag and drop",
      "compress",
      "encrypt",
      "chunk",
      "first file",
      "how to upload",
    ],
  },
  {
    title: "Download and decrypt",
    section: "Getting Started",
    content:
      "Click any file to download. zcrypt downloads encrypted chunks, reassembles them, decrypts, and decompresses — all locally. The original file is reconstructed in your browser. No plaintext ever touches our servers.",
    href: "/docs/getting-started",
    tags: [
      "download",
      "decrypt",
      "reassemble",
      "decompress",
      "retrieve",
      "get file",
    ],
  },
  {
    title: "Connect a storage backend",
    section: "Getting Started",
    content:
      "Pro and Plus users can connect their own GitHub, GitLab, or Hugging Face repositories. Go to Settings → Platform Tokens to add a personal access token. Files are stored as encrypted blobs in your own repos.",
    href: "/docs/getting-started",
    tags: [
      "connect",
      "storage backend",
      "platform token",
      "github",
      "gitlab",
      "huggingface",
      "BYOB",
      "bring your own backend",
      "settings",
    ],
  },

  // ═══ Security ═══
  {
    title: "Security Overview",
    section: "Security",
    content:
      "zcrypt is built on a zero-knowledge architecture. We cannot read, access, or decrypt your files — by design. Your encryption key is derived from a passphrase that only you know, and all cryptographic operations happen locally on your device.",
    href: "/docs/security#overview",
    tags: [
      "zero knowledge",
      "privacy",
      "architecture",
      "client-side encryption",
      "local encryption",
      "security overview",
    ],
  },
  {
    title: "AES-256-GCM Encryption",
    section: "Security",
    content:
      "Every file is encrypted using AES-256-GCM (Galois/Counter Mode), the same authenticated encryption standard used by financial institutions and governments. GCM provides both confidentiality and integrity — if a single bit of the ciphertext is modified, decryption will fail.",
    href: "/docs/security#encryption",
    tags: [
      "AES",
      "AES-256",
      "GCM",
      "galois counter mode",
      "authenticated encryption",
      "cipher",
      "algorithm",
      "encryption standard",
    ],
  },
  {
    title: "Key Derivation",
    section: "Security",
    content:
      "Your passphrase is never transmitted or stored. It is combined with a unique random salt using a key derivation function to produce a 256-bit encryption key. Each file upload generates a fresh salt so every file has a unique key.",
    href: "/docs/security#encryption",
    tags: [
      "KDF",
      "key derivation",
      "salt",
      "256-bit",
      "per-file keys",
      "passphrase",
      "PBKDF",
    ],
  },
  {
    title: "Upload Pipeline",
    section: "Security",
    content:
      "Files go through: compression with zstd, encryption with AES-256-GCM, chunking into 10 MB pieces, then storage on Git platforms. Chunks have randomized filenames and commit messages to prevent metadata leakage.",
    href: "/docs/security#pipeline",
    tags: [
      "pipeline",
      "compression",
      "zstd",
      "chunking",
      "10 MB",
      "upload process",
      "how upload works",
    ],
  },
  {
    title: "Zero-Knowledge Architecture",
    section: "Security",
    content:
      "We store file metadata (name, size, chunk count, SHA-256 hash), encryption salt, and hashed credentials. We never store your passphrase, encryption keys, or plaintext data. Even a full database breach yields nothing useful.",
    href: "/docs/security#zero-knowledge",
    tags: [
      "zero knowledge",
      "what we store",
      "metadata",
      "database breach",
      "data privacy",
      "no plaintext",
    ],
  },
  {
    title: "Threat Model",
    section: "Security",
    content:
      "Protected against: server-side breaches, MITM attacks, insider threats, storage provider access, metadata leakage. Not protected against: compromised client device, weak passphrase, supply-chain attacks on frontend JS (mitigated by open source).",
    href: "/docs/security#threat-model",
    tags: [
      "threat model",
      "attack",
      "breach",
      "MITM",
      "insider threat",
      "compromise",
      "vulnerability",
      "risk",
    ],
  },
  {
    title: "Platform Token Security",
    section: "Security",
    content:
      "Platform access tokens (GitHub PAT, GitLab token) are encrypted at rest with AES-256-GCM using a server-side key-encryption key (KEK). Tokens are never stored in plaintext. Only minimum permissions are requested.",
    href: "/docs/security#platform-tokens",
    tags: [
      "token security",
      "PAT",
      "personal access token",
      "KEK",
      "key encryption key",
      "encrypted at rest",
      "token storage",
    ],
  },

  // ═══ Tools ═══
  {
    title: "Send File",
    section: "Tools",
    content:
      "Pick a file and zcrypt encrypts it in your browser using AES-256. You get a shareable link with the decryption key in the URL fragment — it never touches the server. Options for 1 hour, 24 hour, or 7 day expiry. Burn after read available.",
    href: "/docs/tools#send",
    tags: [
      "send",
      "share file",
      "file sharing",
      "link",
      "shareable link",
      "burn after read",
      "expiry",
      "one-time",
      "50 MB",
    ],
  },
  {
    title: "Text Pad",
    section: "Tools",
    content:
      "Share passwords, API keys, or notes securely with a single link. Type or paste text, zcrypt encrypts it client-side, and gives you a link. View-once option destroys the pad after one view. No account needed. Max 1 MB of text.",
    href: "/docs/tools#pad",
    tags: [
      "pad",
      "text",
      "note",
      "password sharing",
      "API key",
      "secret",
      "secure note",
      "view once",
      "pastebin",
    ],
  },
  {
    title: "Transfer",
    section: "Tools",
    content:
      "Stream a file directly between two devices via WebSocket. The sender picks a file and gets a 6-digit code or QR code. The receiver enters the code. Files stream encrypted in 64 KB chunks — the server relays data and stores nothing.",
    href: "/docs/tools#transfer",
    tags: [
      "transfer",
      "peer to peer",
      "P2P",
      "device to device",
      "QR code",
      "6-digit code",
      "websocket",
      "real-time",
      "stream",
      "no storage",
    ],
  },
  {
    title: "Snapshots",
    section: "Tools",
    content:
      "Save a point-in-time copy of your vault or specific files. Restore any snapshot to roll back. Like version history for encrypted storage. Snapshots are encrypted and kept until you delete them.",
    href: "/docs/tools#snapshots",
    tags: [
      "snapshot",
      "version",
      "backup",
      "restore",
      "rollback",
      "version history",
      "point in time",
      "undo",
    ],
  },
  {
    title: "Integrity Check",
    section: "Tools",
    content:
      "Verify files haven't been tampered with. Compares SHA-256 hash of stored files against the original hash recorded at upload. Detects corruption, tampering, and bit rot. Verification runs locally in your browser.",
    href: "/docs/tools#integrity",
    tags: [
      "integrity",
      "verify",
      "hash",
      "SHA-256",
      "corruption",
      "tamper",
      "bit rot",
      "checksum",
    ],
  },
  {
    title: "Expiring Files",
    section: "Tools",
    content:
      "Set any file to auto-delete after a set time. Options include hours, days, or a custom date. When expired, the file is permanently deleted from all storage backends. Useful for temporary shares or sensitive documents.",
    href: "/docs/tools#expiring",
    tags: [
      "expiring",
      "auto-delete",
      "TTL",
      "time to live",
      "temporary",
      "self-destruct",
      "timed deletion",
    ],
  },
  {
    title: "Devices",
    section: "Tools",
    content:
      "See every active session on your account — browser, device type, IP address, last active time. Revoke any session you don't recognize instantly. Current device is highlighted so you don't lock yourself out.",
    href: "/docs/tools#devices",
    tags: [
      "devices",
      "sessions",
      "active sessions",
      "revoke",
      "logout",
      "IP address",
      "device management",
      "security",
    ],
  },

  // ═══ Platform Adapters ═══
  {
    title: "GitHub Adapter",
    section: "Platform Adapters",
    content:
      "Use GitHub as your storage backend. Requires a Personal Access Token with repo scope. zcrypt creates and rotates private repositories automatically. Recommended limit ~850 MB per repository.",
    href: "/docs/platform-adapters#github",
    tags: [
      "github",
      "PAT",
      "personal access token",
      "repo scope",
      "private repository",
      "850 MB",
      "git storage",
    ],
  },
  {
    title: "GitLab Adapter",
    section: "Platform Adapters",
    content:
      "Use GitLab for larger storage. Requires a Personal Access Token with api and write_repository scopes. Recommended limit ~9 GB per repository. Ideal for users with large files.",
    href: "/docs/platform-adapters#gitlab",
    tags: [
      "gitlab",
      "personal access token",
      "api scope",
      "write_repository",
      "9 GB",
      "large files",
    ],
  },
  {
    title: "Hugging Face Adapter",
    section: "Platform Adapters",
    content:
      "Use Hugging Face with Git LFS for the highest per-repository capacity (~280 GB). Requires a User Access Token with write permission. Creates private datasets for storage. Ideal for large encrypted backups.",
    href: "/docs/platform-adapters#hugging-face",
    tags: [
      "hugging face",
      "huggingface",
      "Git LFS",
      "280 GB",
      "large backup",
      "dataset",
      "write permission",
    ],
  },
  {
    title: "Automatic Repository Rotation",
    section: "Platform Adapters",
    content:
      "zcrypt monitors repository storage usage and automatically creates new repositories when capacity limits are approached. Rotation thresholds: GitHub 850 MB, GitLab 9 GB, Hugging Face 280 GB.",
    href: "/docs/platform-adapters",
    tags: [
      "rotation",
      "auto-rotation",
      "repository pool",
      "repo pool",
      "capacity",
      "storage limit",
      "threshold",
    ],
  },

  // ═══ Terminal App ═══
  {
    title: "Terminal App (TUI)",
    section: "Terminal App",
    content:
      "A full terminal interface for your vault built with Go and Bubble Tea. Upload, download, and manage files from the command line with vim-style navigation. Same encryption pipeline as the web app.",
    href: "/tui",
    tags: [
      "TUI",
      "terminal",
      "CLI",
      "command line",
      "Bubble Tea",
      "vim",
      "Go",
      "install",
    ],
  },

  // ═══ Dead Man's Switch ═══
  {
    title: "Dead Man's Switch",
    section: "Dead Man's Switch",
    content:
      "Automatically notify a trusted contact if you stop checking in. Set a timeout from 7 to 365 days. Every login resets the timer. Custom messages and optional file listing included in the notification.",
    href: "/docs/dead-mans-switch",
    tags: [
      "dead man switch",
      "dead mans switch",
      "inactivity",
      "trusted contact",
      "emergency",
      "notification",
      "check-in",
      "timeout",
      "safety net",
      "digital legacy",
    ],
  },

  // ═══ Decoy Profile ═══
  {
    title: "Decoy Profile",
    section: "Decoy Profile",
    content:
      "Create a fake vault with a decoy password for plausible deniability. When forced to log in, the decoy password shows innocent-looking files. No technical way to tell the difference between real and decoy vault.",
    href: "/docs/decoy-profile",
    tags: [
      "decoy",
      "fake vault",
      "plausible deniability",
      "duress",
      "coercion",
      "fake password",
      "hidden vault",
      "border crossing",
      "privacy",
    ],
  },

  // ═══ Encrypted Notes ═══
  {
    title: "Encrypted Notes",
    section: "Encrypted Notes",
    content:
      "End-to-end encrypted notepad. Write passwords, API keys, journal entries, or code snippets. AES-GCM encryption with a random 256-bit key stored in localStorage. Tags, pinning, and full-text search.",
    href: "/docs/encrypted-notes",
    tags: [
      "notes",
      "notepad",
      "encrypted notes",
      "secure notes",
      "password storage",
      "API key",
      "journal",
      "tags",
      "pin",
      "search",
    ],
  },

  // ═══ Shared Vaults ═══
  {
    title: "Shared Vaults",
    section: "Shared Vaults",
    content:
      "Create collaborative file vaults and invite other users. Role-based access with viewer, editor, and admin permissions. Share files from your existing vault with team members.",
    href: "/docs/shared-vaults",
    tags: [
      "shared vault",
      "collaboration",
      "team",
      "invite",
      "role",
      "viewer",
      "editor",
      "admin",
      "permissions",
      "share files",
    ],
  },


  // ═══ Advanced Usage ═══
  {
    title: "Vault Snapshots",
    section: "Advanced Usage",
    content:
      "Save a point-in-time copy of your vault or individual files. Roll back to any previous snapshot if you accidentally delete or overwrite something. Snapshots are encrypted like all other data.",
    href: "/docs/advanced#snapshots",
    tags: [
      "snapshot",
      "backup",
      "restore",
      "rollback",
      "version history",
      "undo",
    ],
  },
  {
    title: "Integrity Verification",
    section: "Advanced Usage",
    content:
      "Compare SHA-256 hashes of stored files against original hashes from upload time. Detects silent corruption, tampering, or bit rot. Runs locally in your browser.",
    href: "/docs/advanced#integrity",
    tags: [
      "integrity",
      "verify",
      "hash",
      "SHA-256",
      "corruption",
      "tamper",
      "checksum",
    ],
  },
  {
    title: "Expiring Files",
    section: "Advanced Usage",
    content:
      "Set any file to auto-delete after a specific time. Options include hours, days, or a custom date. Permanent deletion from all storage backends when the timer runs out.",
    href: "/docs/advanced#expiring",
    tags: [
      "expiring",
      "auto-delete",
      "TTL",
      "temporary",
      "self-destruct",
      "timed",
    ],
  },
  {
    title: "Device Management",
    section: "Advanced Usage",
    content:
      "View every active session on your account: browser, OS, IP address, last active time. Revoke any session you do not recognize. Your current device is highlighted.",
    href: "/docs/advanced#devices",
    tags: [
      "devices",
      "sessions",
      "revoke",
      "logout",
      "IP",
      "active sessions",
    ],
  },
  {
    title: "Analytics Dashboard",
    section: "Advanced Usage",
    content:
      "Visual breakdowns of vault usage. File type distribution, compression efficiency, storage usage over time, platform distribution, download activity, and most accessed files.",
    href: "/docs/advanced#analytics",
    tags: [
      "analytics",
      "dashboard",
      "insights",
      "statistics",
      "storage usage",
      "compression",
    ],
  },
  {
    title: "Bulk Operations",
    section: "Advanced Usage",
    content:
      "Select multiple files to download as a ZIP (max 2 GB) or delete in bulk. Available from the dashboard file view with a floating action bar.",
    href: "/docs/advanced#bulk",
    tags: [
      "bulk",
      "bulk download",
      "bulk delete",
      "ZIP",
      "select all",
      "batch",
    ],
  },
];
