import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Send,
  FileText,
  Wifi,
  Layers,
  ShieldCheck,
  Clock,
  MonitorSmartphone,
  Lock,
  Eye,
  Download,
  Upload,
  Shield,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Tools | zcrypt Docs",
  description:
    "Learn how to use zcrypt tools: encrypted file sharing, secure text pads, peer-to-peer transfers, file snapshots, integrity verification, expiring files, and device management.",
  keywords: [
    "encrypted file sharing tool",
    "secure text pad",
    "peer to peer file transfer",
    "file snapshot versioning",
    "file integrity check",
    "expiring encrypted files",
    "device management",
    "zero knowledge tools",
  ],
  alternates: { canonical: "https://zcrypt.cloud/docs/tools" },
  openGraph: {
    title: "Tools | zcrypt Docs",
    description:
      "Learn how to use zcrypt tools: encrypted file sharing, secure text pads, P2P transfers, snapshots, and more.",
    url: "https://zcrypt.cloud/docs/tools",
  },
};

const tools = [
  {
    id: "send",
    icon: Send,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    title: "Send File",
    tagline: "Share a file with a link. Encrypted before it leaves your browser.",
    what: "Pick a file, and zcrypt encrypts it right in your browser using AES-256. You get a link you can share with anyone. The decryption key is part of the link. It never touches our server.",
    steps: [
      "Select a file (up to 50 MB without an account, more with one)",
      "The file is encrypted in your browser automatically",
      "Copy the generated link and send it to whoever needs the file",
      "They open the link and the file decrypts and downloads in their browser",
    ],
    details: [
      { label: "Encryption", value: "AES-256-GCM, in your browser" },
      { label: "Key storage", value: "In the URL fragment (never sent to server)" },
      { label: "Expiry options", value: "1 hour, 24 hours, or 7 days" },
      { label: "Burn after read", value: "File is deleted after one download" },
    ],
    publicUrl: "/send",
    appTab: "send",
  },
  {
    id: "pad",
    icon: FileText,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    title: "Text Pad",
    tagline: "Share passwords, API keys, or notes securely with a single link.",
    what: "Type or paste any text: a password, API key, code snippet, or private note. zcrypt encrypts it in your browser and gives you a link. The person you share it with opens the link and sees the text.",
    steps: [
      "Type or paste your text",
      "Choose an expiry time and whether to burn after reading",
      "Click encrypt to get a shareable link",
      "The recipient opens the link and sees the decrypted text",
    ],
    details: [
      { label: "Max size", value: "1 MB of text" },
      { label: "Encryption", value: "AES-256-GCM, client-side" },
      { label: "View once", value: "Optional. Destroys the pad after one view" },
      { label: "No account needed", value: "Works for anyone, no sign-up" },
    ],
    publicUrl: "/pad",
    appTab: "pad",
  },
  {
    id: "transfer",
    icon: Wifi,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    title: "Transfer",
    tagline: "Stream a file directly from one device to another. Nothing is stored.",
    what: "Transfer sends files between two devices in real time using a WebSocket connection. The sender picks a file and gets a 6-digit code. The receiver enters the code on their device. The file streams encrypted between them. The server just relays the encrypted bytes and stores nothing.",
    steps: [
      "On device A: tap \"Send a File\" and pick a file",
      "Share the 6-digit code (or QR code) with device B",
      "On device B: tap \"Receive a File\" and enter the code",
      "The file streams encrypted and downloads automatically on device B",
    ],
    details: [
      { label: "No size limit", value: "Files stream in 64 KB chunks" },
      { label: "Nothing stored", value: "Server relays data, stores zero bytes" },
      { label: "Pairing", value: "6-digit code or QR scan" },
      { label: "Works on", value: "Any device with a browser" },
    ],
    publicUrl: "/transfer",
    appTab: "transfer",
  },
  {
    id: "snapshots",
    icon: Layers,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    title: "Snapshots",
    tagline: "Save a point-in-time copy of your files. Restore anytime.",
    what: "Snapshots let you save the current state of your vault or specific files. If you accidentally delete or overwrite something, you can roll back to any snapshot. Think of it like version history for your encrypted storage.",
    steps: [
      "Go to Tools → Snapshots",
      "Click \"Create Snapshot\" to save the current state",
      "Browse previous snapshots to see what changed",
      "Restore any snapshot to roll back to that point in time",
    ],
    details: [
      { label: "Scope", value: "Entire vault or individual files" },
      { label: "Retention", value: "Kept until you delete them" },
      { label: "Encrypted", value: "Snapshots are encrypted like everything else" },
      { label: "Requires", value: "zcrypt account" },
    ],
    appTab: "snapshots",
  },
  {
    id: "integrity",
    icon: ShieldCheck,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    title: "Integrity",
    tagline: "Verify your files haven't been tampered with.",
    what: "Integrity checking compares the hash of your stored files against the original hash recorded at upload time. If anything has changed, even a single byte, you will know. This protects against silent corruption or unauthorized modification.",
    steps: [
      "Go to Tools → Integrity",
      "Select files or run a full vault check",
      "zcrypt downloads, decrypts, and hashes each file",
      "Results show which files pass and which have changed",
    ],
    details: [
      { label: "Hash algorithm", value: "SHA-256" },
      { label: "What it catches", value: "Corruption, tampering, bit rot" },
      { label: "Runs locally", value: "Verification happens in your browser" },
      { label: "Requires", value: "zcrypt account" },
    ],
    appTab: "integrity",
  },
  {
    id: "expiring",
    icon: Clock,
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    title: "Expiring Files",
    tagline: "Set files to auto-delete after a set time.",
    what: "Mark any file in your vault with an expiration date. When the time is up, the file is permanently deleted from all storage backends. Useful for temporary shares, sensitive documents, or anything you don't want lingering around.",
    steps: [
      "Upload a file or select an existing one",
      "Set an expiration time (hours, days, or a specific date)",
      "The file works normally until the expiry",
      "Once expired, the file is permanently and irreversibly deleted",
    ],
    details: [
      { label: "Options", value: "Hours, days, or custom date" },
      { label: "Deletion", value: "Permanent. Removed from all backends" },
      { label: "View active", value: "Tools → Expiring shows all timed files" },
      { label: "Requires", value: "zcrypt account" },
    ],
    appTab: "expiring",
  },
  {
    id: "devices",
    icon: MonitorSmartphone,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    title: "Devices",
    tagline: "See what's connected to your account and manage sessions.",
    what: "The Devices tab shows every active session on your account: browser, device type, IP address, and when it was last active. If you see something you don't recognize, you can revoke the session instantly.",
    steps: [
      "Go to Tools → Devices",
      "Review the list of active sessions",
      "Check device type, browser, location, and last activity",
      "Revoke any session you don't recognize",
    ],
    details: [
      { label: "Shows", value: "Browser, OS, IP, last active time" },
      { label: "Revoke", value: "Instantly kills the session" },
      { label: "Current device", value: "Highlighted so you don't lock yourself out" },
      { label: "Requires", value: "zcrypt account" },
    ],
    appTab: "devices",
  },
];

export default function ToolsDocsPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          { name: "Tools", url: "https://zcrypt.cloud/docs/tools" },
        ]}
      />

      {/* Header */}
      <section className="pt-24 md:pt-32 pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <Link
            href="/docs"
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors mb-6"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to docs
          </Link>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight font-heading">
            Tools
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            zcrypt includes seven built-in tools for sharing, transferring, and
            managing your encrypted files. Three work without an account.
          </p>
        </div>
      </section>

      {/* Quick nav */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {tools.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-1)] transition-colors text-sm"
              >
                <t.icon className={`h-3.5 w-3.5 ${t.color}`} />
                <span className="font-medium">{t.title}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Tool sections */}
      <section className="pb-16 px-4">
        <div className="max-w-3xl mx-auto space-y-16">
          {tools.map((tool) => (
            <div key={tool.id} id={tool.id} className="scroll-mt-24">
              {/* Tool header */}
              <div className="flex items-start gap-4 mb-6">
                <div className={`flex-shrink-0 flex items-center justify-center h-11 w-11 rounded-xl ${tool.bg}`}>
                  <tool.icon className={`h-5 w-5 ${tool.color}`} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{tool.title}</h2>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                    {tool.tagline}
                  </p>
                </div>
              </div>

              {/* What it does */}
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed mb-6">
                {tool.what}
              </p>

              {/* How to use it */}
              <div className="mb-6">
                <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                  How to use it
                </h3>
                <ol className="space-y-2">
                  {tool.steps.map((step, i) => (
                    <li key={i} className="flex gap-3 text-sm text-[var(--color-text-secondary)]">
                      <span className="flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-[var(--color-surface-1)] text-[10px] font-bold">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              {/* Details table */}
              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                {tool.details.map((d, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-4 px-4 py-3 text-sm ${
                      i !== 0 ? "border-t border-[var(--color-border)]" : ""
                    }`}
                  >
                    <span className="flex-shrink-0 w-32 font-medium text-[var(--color-text-secondary)]">
                      {d.label}
                    </span>
                    <span className="text-[var(--color-text)]">{d.value}</span>
                  </div>
                ))}
              </div>

              {/* Links */}
              <div className="flex items-center gap-4 mt-4">
                {tool.publicUrl && (
                  <Link
                    href={tool.publicUrl}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-cyan-600 dark:text-cyan-400 hover:gap-2.5 transition-all"
                  >
                    Try it now <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
                <Link
                  href={`/tools?tab=${tool.appTab}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors"
                >
                  Open in app <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Related */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Related docs</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/docs/security"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Security Model
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                How encryption, key management, and zero-knowledge architecture
                work under the hood.
              </p>
            </Link>
            <Link
              href="/docs/getting-started"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Getting Started
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Create an account, set your passphrase, and upload your first
                encrypted file.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
