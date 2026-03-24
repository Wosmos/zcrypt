import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  FileText,
  Lock,
  Search,
  Star,
  Shield,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Encrypted Notes | zcrypt Docs",
  description:
    "Create, search, and organize end-to-end encrypted notes in zcrypt. Client-side AES-GCM encryption with tags, pinning, and full-text search.",
  keywords: [
    "encrypted notes",
    "secure notes",
    "end-to-end encrypted notepad",
    "private notes",
    "zero knowledge notes",
    "zcrypt notes",
    "encrypted text",
    "secure notepad app",
  ],
  alternates: {
    canonical: "https://zcrypt.cloud/docs/encrypted-notes",
  },
  openGraph: {
    title: "Encrypted Notes | zcrypt Docs",
    description:
      "End-to-end encrypted notes with tags, pinning, and full-text search. Everything is encrypted in your browser.",
    url: "https://zcrypt.cloud/docs/encrypted-notes",
  },
};

export default function EncryptedNotesPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          {
            name: "Encrypted Notes",
            url: "https://zcrypt.cloud/docs/encrypted-notes",
          },
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
            Encrypted Notes
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            A built-in notepad where everything you write is encrypted in your
            browser before it reaches our servers.
          </p>
        </div>
      </section>

      {/* Overview */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-violet-500" />
              </div>
              <h2 className="text-lg font-bold">How it works</h2>
            </div>
            <div className="space-y-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
              <p>
                zcrypt Notes is a simple, encrypted notepad built into your
                vault. Write anything: passwords, API keys, journal entries,
                meeting notes, code snippets. Every note is encrypted with
                AES-GCM using a random 256-bit key before it leaves your
                browser.
              </p>
              <p>
                Your encryption key is generated once and stored in your
                browser&apos;s localStorage. The server only ever sees encrypted
                blobs. Even if our database is compromised, your notes are
                unreadable without your local key.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Features
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[
              {
                icon: Lock,
                color: "text-cyan-500",
                bg: "bg-cyan-500/10",
                title: "Client-side encryption",
                desc: "AES-GCM with a random 256-bit key. Encryption and decryption happen entirely in your browser.",
              },
              {
                icon: Search,
                color: "text-violet-500",
                bg: "bg-violet-500/10",
                title: "Full-text search",
                desc: "Search across note titles, body text, and tags. Results filter instantly as you type.",
              },
              {
                icon: Star,
                color: "text-amber-500",
                bg: "bg-amber-500/10",
                title: "Pin important notes",
                desc: "Star your most important notes to keep them at the top of the list.",
              },
              {
                icon: FileText,
                color: "text-emerald-500",
                bg: "bg-emerald-500/10",
                title: "Tags",
                desc: "Organize notes with comma-separated tags. Filter by tag to find what you need quickly.",
              },
            ].map((feature, i) => (
              <div key={i} className="card p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`h-7 w-7 rounded-lg ${feature.bg} flex items-center justify-center`}
                  >
                    <feature.icon className={`h-3.5 w-3.5 ${feature.color}`} />
                  </div>
                  <h3 className="text-sm font-bold">{feature.title}</h3>
                </div>
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Using notes */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Using Notes
          </h2>
          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "Open Notes",
                desc: "Click Notes in the sidebar or navigate to /notes. On desktop, you will see a split view with the note list on the left and the editor on the right. On mobile, you switch between the list and editor views.",
              },
              {
                step: "2",
                title: "Create a note",
                desc: "Click the plus button to create a new note. Give it a title, write your content, and optionally add comma-separated tags.",
              },
              {
                step: "3",
                title: "Save",
                desc: "Click Save. Your note is encrypted in your browser and the encrypted blob is sent to the server. The server never sees the plaintext.",
              },
              {
                step: "4",
                title: "Search and organize",
                desc: "Use the search bar to filter notes by title, body, or tags. Pin important notes with the star icon to keep them at the top.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-violet-500/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-violet-600 dark:text-violet-400">
                    {item.step}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-bold mb-1">{item.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Encryption details */}
      <section className="pb-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Encryption details
          </h2>
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
            {[
              { label: "Algorithm", value: "AES-GCM (256-bit key)" },
              {
                label: "Key generation",
                value: "crypto.getRandomValues() in your browser",
              },
              {
                label: "Key storage",
                value: "Browser localStorage (never sent to server)",
              },
              {
                label: "IV",
                value: "Random initialization vector per encryption",
              },
              {
                label: "Server stores",
                value: "Encrypted title + encrypted body as Base64",
              },
              { label: "Requires", value: "zcrypt account" },
            ].map((d, i) => (
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
          <div className="mt-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong className="font-semibold">Note:</strong> Your encryption
              key is stored in localStorage. If you clear browser data or switch
              devices, you will need to re-enter or transfer your key. Notes
              encrypted with a lost key cannot be recovered.
            </p>
          </div>
        </div>
      </section>

      {/* Related */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Related</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/docs/tools#pad"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Text Pad
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Share encrypted text with a one-time link. No account required.
              </p>
            </Link>
            <Link
              href="/docs/security"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Security Model
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                How zcrypt encrypts your data and the zero-knowledge
                architecture.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
