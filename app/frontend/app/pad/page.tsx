import type { Metadata } from "next";
import { PadTool } from "@/components/tools/pad-tool";
import { Shield, Lock, Clock, Eye, Zap, FileText } from "@/lib/icons";
import { toolMetadata } from "@/lib/tool-metadata";
import {
  ToolPageShell,
  ToolHero,
  ToolSection,
  StepGrid,
  FeatureGrid,
  ToolCta,
  type ToolFeature,
} from "@/components/tools/tool-page-shell";

export const metadata: Metadata = toolMetadata({
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
  path: "/pad",
  ogTitle: "Encrypted Text Pad — zcrypt",
  ogDescription:
    "Zero-knowledge encrypted text sharing. Paste, encrypt, share. The server never sees your plaintext.",
});

const features: ToolFeature[] = [
  { icon: Lock, title: "Client-side encryption", desc: "Text is encrypted with AES-256-GCM in your browser. The server stores only encrypted bytes." },
  { icon: Shield, title: "Key in the link", desc: "The decryption key lives in the URL fragment — it never reaches the server, not even in access logs." },
  { icon: Clock, title: "Timed expiry", desc: "Pads auto-delete after 1 hour, 24 hours, or 7 days. No leftover data, ever." },
  { icon: Eye, title: "View once", desc: "Enable burn-after-read to destroy the pad after a single view." },
  { icon: Zap, title: "Instant & anonymous", desc: "No sign-up required. No IP logging. No cookies. Just encrypted text." },
  { icon: FileText, title: "Up to 1 MB", desc: "Share code snippets, credentials, notes, or any text up to 1 MB." },
];

export default function PadPublicPage() {
  return (
    <ToolPageShell>
      <ToolHero
        badgeIcon={Shield}
        badgeLabel="Zero-knowledge text sharing"
        titleLead="Encrypted text pad."
        titleAccent="Share privately."
        subtitle="Paste your text, get an encrypted link. Perfect for sharing passwords, API keys, code snippets, or anything sensitive. Everything is encrypted in your browser."
      />

      {/* Tool */}
      <ToolSection maxWidth="max-w-2xl">
        <PadTool />
      </ToolSection>

      {/* How it works */}
      <section className="py-16 sm:py-20 border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-center mb-4">
            How encrypted text sharing works
          </h2>
          <p className="text-center text-[var(--color-text-secondary)] mb-12 max-w-xl mx-auto">
            Type. Encrypt. Share. The server never sees your plaintext.
          </p>

          <StepGrid
            steps={[
              { step: "1", title: "Type or paste", desc: "Enter your text. It stays in your browser until you encrypt." },
              { step: "2", title: "One-click encrypt", desc: "A unique AES-256-GCM key is generated. Your text is encrypted locally and uploaded." },
              { step: "3", title: "Share the link", desc: "The key is embedded in the URL fragment. Only people with the link can read it." },
            ]}
          />
        </div>
      </section>

      {/* Features grid */}
      <FeatureGrid heading="Private by design" features={features} />

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
      <ToolCta
        heading="Need persistent encrypted notes?"
        description="Create a free zcrypt account for encrypted personal notes, 10 GB of cloud storage, and more."
      />
    </ToolPageShell>
  );
}
