import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  Shield,
  Lock,
  AlertTriangle,
  Check,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Decoy Profile | zcrypt Docs",
  description:
    "Create a decoy vault in zcrypt with a fake password for plausible deniability. Protect your real files under coercion with an innocent-looking fake vault.",
  keywords: [
    "decoy vault",
    "decoy profile",
    "plausible deniability",
    "fake vault",
    "coercion protection",
    "duress password",
    "zcrypt decoy",
    "privacy under pressure",
  ],
  alternates: {
    canonical: "https://zcrypt.cloud/docs/decoy-profile",
  },
  openGraph: {
    title: "Decoy Profile | zcrypt Docs",
    description:
      "Plausible deniability for your encrypted files. Log in with a decoy password to show a fake vault.",
    url: "https://zcrypt.cloud/docs/decoy-profile",
  },
};

export default function DecoyProfilePage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          {
            name: "Decoy Profile",
            url: "https://zcrypt.cloud/docs/decoy-profile",
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
            Decoy Profile
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            Show a fake vault when forced to log in. Your real files stay hidden
            behind your actual password.
          </p>
        </div>
      </section>

      {/* What it is */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                <Eye className="h-5 w-5 text-violet-500" />
              </div>
              <h2 className="text-lg font-bold">What is plausible deniability?</h2>
            </div>
            <div className="space-y-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
              <p>
                In situations where someone might force you to unlock your
                account (border crossings, legal pressure, physical coercion),
                plausible deniability lets you comply without revealing your real
                data.
              </p>
              <p>
                zcrypt lets you set up a second password that opens a decoy
                vault filled with innocent-looking files. There is no technical
                way for an attacker to tell whether the vault they see is real
                or fake.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            How it works
          </h2>
          <div className="space-y-6">
            {[
              {
                title: "Two passwords, two vaults",
                content:
                  "Your real password opens your actual encrypted vault. The decoy password opens a separate, fake vault. Both look identical in the interface. There is no visual indicator that tells which vault is active.",
              },
              {
                title: "Fake files look real",
                content:
                  "You populate the decoy vault with fake files that you define. Set file names and sizes that look believable. An attacker sees what appears to be a normal cloud storage account with ordinary files.",
              },
              {
                title: "Indistinguishable by design",
                content:
                  "The login flow is identical for both passwords. The server treats decoy sessions the same as real sessions. There is no metadata, timing difference, or API response that reveals which vault is being accessed.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="pl-5 border-l-2 border-[var(--color-border)]"
              >
                <h3 className="text-sm font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {item.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Setup */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Setting it up
          </h2>
          <div className="space-y-4">
            {[
              {
                step: "1",
                title: "Go to Settings",
                desc: "Navigate to Settings, then Decoy Profile, or go directly to /settings/decoy.",
              },
              {
                step: "2",
                title: "Create a decoy password",
                desc: "Choose a password that is different from your real login password. Minimum 6 characters. This is the password that opens the fake vault.",
              },
              {
                step: "3",
                title: "Add fake files",
                desc: "Create believable-looking files with names and sizes that match what someone might expect to find. Think: vacation-photos.zip, tax-return-2025.pdf, resume.docx.",
              },
              {
                step: "4",
                title: "Test it",
                desc: "Log out and log back in with your decoy password. Verify that the fake vault looks convincing and that your real files are completely hidden.",
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

      {/* Important notes */}
      <section className="pb-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Important notes
          </h2>
          <div className="space-y-3">
            <div className="px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
                <strong className="font-semibold">Security tip:</strong> Make
                your decoy vault look realistic. An empty vault or a vault with
                a single test file is suspicious. Add multiple files with
                different types and sizes.
              </p>
            </div>
            <div className="px-4 py-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-sm text-blue-700 dark:text-blue-400 leading-relaxed">
                <strong className="font-semibold">Remember:</strong> The decoy
                password must be different from your real password. If you forget
                which is which, there is no way to recover access to your real
                vault.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-[var(--color-border)] overflow-hidden">
            {[
              {
                label: "Location",
                value: "Settings > Decoy Profile",
              },
              {
                label: "Password",
                value:
                  "Must be different from your real password (min 6 characters)",
              },
              {
                label: "Fake files",
                value: "You define the names and sizes. Add as many as you want.",
              },
              {
                label: "Detection",
                value:
                  "No technical way to distinguish real from decoy vault",
              },
              {
                label: "Requires",
                value: "zcrypt account",
              },
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
        </div>
      </section>

      {/* Related */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Related</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/docs/dead-mans-switch"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Dead Man&apos;s Switch
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Automatically alert a trusted contact if you stop checking in.
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
