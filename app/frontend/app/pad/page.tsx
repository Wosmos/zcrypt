import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { PadTool } from "@/components/tools/pad-tool";
import { Shield, Lock, Clock, Eye, Zap, FileText } from "@/lib/icons";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Encrypted Text Pad — Share Passwords & Secrets Securely | zcrypt",
  description:
    "Zero-knowledge encrypted text sharing. Paste text, get an encrypted link. The decryption key never leaves your browser. Perfect for sharing passwords, API keys, and sensitive notes. Auto-expiry and burn-after-read.",
  keywords: [
    "encrypted text sharing",
    "secure text pad",
    "encrypted notepad",
    "share passwords securely",
    "zero knowledge text sharing",
    "encrypted pastebin",
    "secure pastebin alternative",
    "burn after read",
    "self destructing notes",
    "share API keys securely",
    "encrypted note sharing",
    "private text pad",
    "anonymous text sharing",
    "one time secret",
  ],
  alternates: { canonical: "https://zcrypt.cloud/pad" },
  openGraph: {
    title: "Encrypted Text Pad — zcrypt",
    description:
      "Zero-knowledge encrypted text sharing. Paste, encrypt, share. The server never sees your plaintext.",
    url: "https://zcrypt.cloud/pad",
  },
  twitter: {
    card: "summary_large_image",
    title: "Encrypted Text Pad — zcrypt",
    description:
      "Zero-knowledge encrypted text sharing. Paste, encrypt, share. The server never sees your plaintext.",
  },
};

const features = [
  { icon: Lock, title: "Client-side encryption", desc: "Text is encrypted with AES-256-GCM in your browser. The server stores only encrypted bytes." },
  { icon: Shield, title: "Key in the link", desc: "The decryption key lives in the URL fragment — it never reaches the server, not even in access logs." },
  { icon: Clock, title: "Timed expiry", desc: "Pads auto-delete after 1 hour, 24 hours, or 7 days. No leftover data, ever." },
  { icon: Eye, title: "View once", desc: "Enable burn-after-read to destroy the pad after a single view." },
  { icon: Zap, title: "Instant & anonymous", desc: "No sign-up required. No IP logging. No cookies. Just encrypted text." },
  { icon: FileText, title: "Up to 1 MB", desc: "Share code snippets, credentials, notes, or any text up to 1 MB." },
];

export default function PadPublicPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-bg)]">
      <MarketingNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="pt-28 pb-8 sm:pt-32 sm:pb-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-muted)] mb-6">
              <Shield className="h-3 w-3 text-[var(--color-accent)]" />
              Zero-knowledge text sharing
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold font-heading tracking-tight leading-tight">
              Encrypted text pad.{" "}
              <span className="text-[var(--color-accent)]">Share privately.</span>
            </h1>
            <p className="mt-4 text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto leading-relaxed">
              Paste your text, get an encrypted link. Perfect for sharing passwords, API keys, code snippets,
              or anything sensitive. Everything is encrypted in your browser.
            </p>
          </div>
        </section>

        {/* Tool */}
        <section className="pb-16 sm:pb-20">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <PadTool />
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 sm:py-20 border-t border-[var(--color-border)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-center mb-4">
              How encrypted text sharing works
            </h2>
            <p className="text-center text-[var(--color-text-secondary)] mb-12 max-w-xl mx-auto">
              Type. Encrypt. Share. The server never sees your plaintext.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { step: "1", title: "Type or paste", desc: "Enter your text. It stays in your browser until you encrypt." },
                { step: "2", title: "One-click encrypt", desc: "A unique AES-256-GCM key is generated. Your text is encrypted locally and uploaded." },
                { step: "3", title: "Share the link", desc: "The key is embedded in the URL fragment. Only people with the link can read it." },
              ].map((s) => (
                <div key={s.step} className="relative p-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-[var(--color-accent)]/10 text-[var(--color-accent)] font-bold text-lg mb-4">
                    {s.step}
                  </div>
                  <h3 className="text-base font-semibold mb-2">{s.title}</h3>
                  <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{s.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features grid */}
        <section className="py-16 sm:py-20 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-center mb-12">
              Private by design
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((f) => (
                <div key={f.title} className="p-5 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]">
                  <f.icon className="h-5 w-5 text-[var(--color-accent)] mb-3" />
                  <h3 className="text-sm font-semibold mb-1">{f.title}</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Use cases */}
        <section className="py-16 sm:py-20 border-t border-[var(--color-border)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-center mb-12">
              Common use cases
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { title: "Passwords", desc: "Share login credentials securely with burn-after-read enabled." },
                { title: "API keys", desc: "Send API keys and tokens without exposing them in email or chat." },
                { title: "Code snippets", desc: "Share code with colleagues that auto-expires when no longer needed." },
                { title: "Private notes", desc: "Send confidential information that disappears after reading." },
              ].map((c) => (
                <div key={c.title} className="p-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                  <h3 className="text-sm font-semibold mb-1">{c.title}</h3>
                  <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 sm:py-20 border-t border-[var(--color-border)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight mb-4">
              Need persistent encrypted notes?
            </h2>
            <p className="text-[var(--color-text-secondary)] mb-8 max-w-md mx-auto">
              Create a free zcrypt account for encrypted personal notes, 10 GB of cloud storage, and more.
            </p>
            <div className="flex items-center justify-center gap-3">
              <Link href="/register" className="px-6 py-2.5 text-sm font-semibold bg-[var(--color-text)] text-[var(--color-bg)] rounded-xl hover:opacity-90 transition-opacity">
                Get started free
              </Link>
              <Link href="/features" className="px-6 py-2.5 text-sm font-medium border border-[var(--color-border)] rounded-xl hover:bg-[var(--color-surface-1)] transition-colors">
                See features
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}
