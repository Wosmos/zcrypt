import { docsNav } from "@/lib/data";

// Builds the LLM-friendly overview served at /llms.txt and /llm.txt (see
// llmstxt.org). The documentation index is generated from `docsNav` — the same
// single source of truth the sitemap uses — so it can never drift from the pages
// that actually exist.

const SITE = "https://zcrypt.cloud";

/** A markdown link line: `- [Title](url) (Badge): description`. */
function entry(title: string, href: string, desc: string, badge?: string): string {
  const url = href.startsWith("http") ? href : `${SITE}${href}`;
  return `- [${title}](${url})${badge ? ` (${badge})` : ""}: ${desc}`;
}

const featureLinks: Array<[string, string, string]> = [
  ["The encrypted drive", "/features/encrypted-drive", "A real, sealed file explorer — folders, previews, and search — over storage you own."],
  ["Folders", "/features/folders", "Nestable folders with optional, real per-folder password encryption."],
  ["File viewers", "/features/file-viewers", "Preview images, video, audio, PDF, DOCX, HTML, Markdown, CSV, and code in-app, decrypted client-side."],
  ["Sharing", "/features/sharing", "Password-protected share links, whole-folder shares, anonymous Send, and one-time encrypted pads."],
  ["Bring your own storage", "/features/bring-your-own-storage", "Store encrypted chunks in GitHub, GitLab, Hugging Face, and Telegram accounts you own; repos auto-rotate as they fill."],
  ["Encryption", "/features/encryption", "Client-side AES-256-GCM with per-file keys and 600,000-iteration PBKDF2 key derivation."],
  ["Transfers", "/features/transfers", "Pause, resume, retry, bulk ZIP downloads, and device-to-device transfer."],
  ["Privacy tools", "/features/privacy", "Decoy profile, dead man's switch, snapshots, and shared vaults."],
  ["Apps", "/features/apps", "Web, desktop (Tauri), and terminal (TUI) clients sharing one encrypted core."],
];

const compareLinks: Array<[string, string, string]> = [
  ["zcrypt vs Dropbox", "/vs/dropbox", "Bring-your-own-storage and zero-knowledge encryption compared with Dropbox."],
  ["zcrypt vs Google Drive", "/vs/google-drive", "How zcrypt's client-side encryption and storage model compare with Google Drive."],
  ["zcrypt vs Proton Drive", "/vs/proton-drive", "Two privacy-first drives compared: BYO-storage vs managed encrypted storage."],
];

const productLinks: Array<[string, string, string]> = [
  ["Download", "/download", "Get the desktop app (macOS, Windows, Linux) and the CLI."],
  ["Terminal app (TUI)", "/tui", "Manage your vault from the command line."],
  ["Anonymous Send", "/send", "Send an encrypted file to anyone without an account."],
  ["Encrypted Pad", "/pad", "Share a one-time, end-to-end encrypted note."],
  ["Device transfer", "/transfer", "Move a file between your devices with a 6-digit code."],
  ["Sign up", "/register", "Create a free account."],
  ["Log in", "/login", "Sign in to your vault."],
];

const companyLinks: Array<[string, string, string]> = [
  ["About", "/about", "The story and the people behind zcrypt."],
  ["Philosophy", "/philosophy", "Why zcrypt is zero-knowledge and bring-your-own-storage."],
  ["Privacy Policy", "/privacy", "What zcrypt can see, what it collects, and what it never touches."],
  ["Terms of Service", "/terms", "The rules of engagement, in plain language."],
];

export function buildLlmsTxt(): string {
  const docs = docsNav
    .map((group) => {
      const items = group.links
        .map((l) => entry(l.title, l.href, l.desc, l.badge))
        .join("\n");
      return `### ${group.title}\n${group.summary}\n\n${items}`;
    })
    .join("\n\n");

  return `# zcrypt

> Zero-knowledge, end-to-end encrypted cloud storage that keeps your files inside storage accounts you already own — GitHub, GitLab, Hugging Face, and Telegram. Files are compressed and encrypted in your browser before they ever leave your device, so neither zcrypt's servers nor the storage platforms can read your files, file names, or keys.

zcrypt (pronounced "z-crypt") is a privacy-first cloud drive. It is free and open source, and it never sells you storage — you connect accounts you already have, and zcrypt turns them into one encrypted drive.

## How it works

- **Client-side encryption.** Each file is compressed with zstd, then encrypted with AES-256-GCM under a random per-file key. That key is wrapped by a key derived from your passphrase with PBKDF2-SHA256 (600,000 iterations). All of this happens in the browser.
- **Chunked, resumable upload.** The encrypted file is split into device-tiered chunks (~4–16 MB, ~10 MB typical) and uploaded one chunk per request into a repository you own. A single file's chunks live in one repo on one platform; as repos fill, zcrypt rotates to fresh ones automatically.
- **Zero-knowledge.** The passphrase is never transmitted, stored, or logged. File and folder names are encrypted client-side too. The server only ever handles opaque encrypted chunks with randomized, build-artifact-looking filenames.
- **Download reverses it client-side.** Chunks are fetched, verified by SHA-256, decrypted, and decompressed on your device.

## Key facts

- **Storage backends:** GitHub, GitLab, Hugging Face, Telegram — you bring your own accounts and tokens (encrypted at rest).
- **Encryption:** AES-256-GCM; PBKDF2-SHA256 at 600k iterations; per-file envelope keys; X25519 ECIES sealed boxes for shared vaults.
- **Clients:** web app, desktop app (Tauri; macOS/Windows/Linux), and a terminal app (TUI).
- **Pricing:** free and open source — no paid tiers.
- **Tech:** Next.js + React frontend; Go (stdlib net/http) backend; PostgreSQL. Frontend on Vercel, backend on Railway.
- **Not this:** not a storage reseller, not a place that can read your files, not closed source.

## Documentation

${docs}

## Features

${featureLinks.map(([t, h, d]) => entry(t, h, d)).join("\n")}

## Compare

${compareLinks.map(([t, h, d]) => entry(t, h, d)).join("\n")}

## Product & account

${productLinks.map(([t, h, d]) => entry(t, h, d)).join("\n")}

## Company

${companyLinks.map(([t, h, d]) => entry(t, h, d)).join("\n")}
`;
}
