import type { Metadata } from "next";
import { MarketingNav } from "@/components/marketing/nav";
import { MarketingFooter } from "@/components/marketing/footer";
import { SendTool } from "@/components/tools/send-tool";
import { Shield, Lock, Clock, Eye, Zap, Server } from "@/lib/icons";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Send Encrypted Files Free — No Account, No Limits | zcrypt",
  description:
    "Send files securely with end-to-end AES-256 encryption. No sign-up required. Files are encrypted in your browser before upload. The decryption key never touches our servers. Free encrypted file sharing up to 50 MB.",
  keywords: [
    "encrypted file sharing",
    "send encrypted files",
    "secure file transfer",
    "end to end encrypted file sharing",
    "send files securely",
    "free encrypted file sharing",
    "zero knowledge file sharing",
    "send files no account",
    "AES-256 file encryption",
    "private file sharing",
    "burn after read file sharing",
    "self destructing file share",
    "anonymous file sharing",
    "secure file send",
  ],
  alternates: { canonical: "https://zcrypt.cloud/send" },
  openGraph: {
    title: "Send Encrypted Files Free — zcrypt",
    description:
      "Drop a file, get an encrypted link. AES-256 encryption in your browser. No account needed.",
    url: "https://zcrypt.cloud/send",
  },
  twitter: {
    card: "summary_large_image",
    title: "Send Encrypted Files Free — zcrypt",
    description:
      "Drop a file, get an encrypted link. AES-256 encryption in your browser. No account needed.",
  },
};

const features = [
  { icon: Lock, title: "Browser encryption", desc: "Files are encrypted with AES-256-GCM before they leave your device. The server never sees your data." },
  { icon: Shield, title: "Zero-knowledge", desc: "The encryption key lives only in the share link fragment. We cannot decrypt your files, even if compelled." },
  { icon: Clock, title: "Auto-expiry", desc: "Set files to expire after 1 hour, 24 hours, or 7 days. Expired files are permanently deleted." },
  { icon: Eye, title: "Burn after read", desc: "Enable one-time access so the file is destroyed after a single download." },
  { icon: Zap, title: "No account required", desc: "Send encrypted files instantly. No sign-up, no tracking, no strings attached." },
  { icon: Server, title: "Up to 50 MB", desc: "Send files up to 50 MB for free. Need more? Create a free account for larger uploads." },
];

export default function SendPublicPage() {
  return (
    <div className="min-h-dvh flex flex-col bg-[var(--color-bg)]">
      <MarketingNav />

      <main className="flex-1">
        {/* Hero */}
        <section className="pt-28 pb-8 sm:pt-32 sm:pb-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] text-xs font-medium text-[var(--color-text-muted)] mb-6">
              <Lock className="h-3 w-3 text-[var(--color-accent)]" />
              End-to-end encrypted
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold font-heading tracking-tight leading-tight">
              Send files securely.{" "}
              <span className="text-[var(--color-accent)]">No account needed.</span>
            </h1>
            <p className="mt-4 text-lg text-[var(--color-text-secondary)] max-w-2xl mx-auto leading-relaxed">
              Drop a file, get an encrypted link. Your file is encrypted in your browser with AES-256 before upload.
              The decryption key never touches our servers.
            </p>
          </div>
        </section>

        {/* Tool */}
        <section className="pb-16 sm:pb-20">
          <div className="mx-auto max-w-lg px-4 sm:px-6">
            <SendTool />
          </div>
        </section>

        {/* How it works */}
        <section className="py-16 sm:py-20 border-t border-[var(--color-border)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-center mb-4">
              How encrypted file sharing works
            </h2>
            <p className="text-center text-[var(--color-text-secondary)] mb-12 max-w-xl mx-auto">
              Three steps. No accounts. No tracking. Your privacy is built into the protocol.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { step: "1", title: "Drop your file", desc: "Select any file up to 50 MB. It never leaves your browser unencrypted." },
                { step: "2", title: "Automatic encryption", desc: "Your file is encrypted with a unique AES-256-GCM key generated in your browser." },
                { step: "3", title: "Share the link", desc: "The decryption key is embedded in the URL fragment. Only the recipient can decrypt." },
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
              Built for privacy, designed for simplicity
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

        {/* CTA */}
        <section className="py-16 sm:py-20 border-t border-[var(--color-border)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight mb-4">
              Need more than 50 MB?
            </h2>
            <p className="text-[var(--color-text-secondary)] mb-8 max-w-md mx-auto">
              Create a free zcrypt account for 10 GB of zero-knowledge encrypted cloud storage, larger file transfers, and persistent encrypted notes.
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
