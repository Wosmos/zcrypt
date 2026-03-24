import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Crown,
  Zap,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Plans and Limits | zcrypt Docs",
  description:
    "Compare zcrypt Free, Plus, and Pro plans. Storage quotas, file size limits, concurrent uploads, sharing limits, and feature availability.",
  keywords: [
    "zcrypt pricing",
    "zcrypt plans",
    "free vs pro",
    "storage limits",
    "zcrypt free tier",
    "encrypted storage pricing",
    "zcrypt quota",
    "file size limit",
  ],
  alternates: {
    canonical: "https://zcrypt.cloud/docs/plans",
  },
  openGraph: {
    title: "Plans and Limits | zcrypt Docs",
    description:
      "Compare zcrypt Free, Plus, and Pro plans. Storage, file size limits, and feature breakdown.",
    url: "https://zcrypt.cloud/docs/plans",
  },
};

const plans = [
  {
    name: "Free",
    price: "$0",
    storage: "10 GB",
    maxFile: "500 MB",
    concurrent: "2 uploads",
    shares: "5 per month",
    byob: false,
    cli: false,
    deadman: false,
    decoy: false,
    notes: true,
    sharedVaults: false,
  },
  {
    name: "Plus",
    price: "$4/mo",
    storage: "200 GB",
    maxFile: "5 GB",
    concurrent: "5 uploads",
    shares: "Unlimited",
    byob: false,
    cli: true,
    deadman: true,
    decoy: true,
    notes: true,
    sharedVaults: true,
  },
  {
    name: "Pro",
    price: "$9/mo",
    storage: "2 TB",
    maxFile: "25 GB",
    concurrent: "Unlimited",
    shares: "Unlimited",
    byob: true,
    cli: true,
    deadman: true,
    decoy: true,
    notes: true,
    sharedVaults: true,
  },
];

const features = [
  { key: "storage", label: "Storage" },
  { key: "maxFile", label: "Max file size" },
  { key: "concurrent", label: "Concurrent uploads" },
  { key: "shares", label: "Share links" },
  { key: "notes", label: "Encrypted Notes" },
  { key: "cli", label: "CLI / TUI access" },
  { key: "sharedVaults", label: "Shared Vaults" },
  { key: "deadman", label: "Dead Man's Switch" },
  { key: "decoy", label: "Decoy Profile" },
  { key: "byob", label: "BYOB (Bring Your Own Backend)" },
];

function CellValue({ value }: { value: string | boolean }) {
  if (typeof value === "boolean") {
    return value ? (
      <Check className="h-4 w-4 text-cyan-500" />
    ) : (
      <X className="h-4 w-4 text-[var(--color-text-muted)]" />
    );
  }
  return <span className="text-sm font-medium">{value}</span>;
}

export default function PlansPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          {
            name: "Plans and Limits",
            url: "https://zcrypt.cloud/docs/plans",
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
            Plans and Limits
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            Every plan includes zero-knowledge encryption. Compare storage
            quotas, file size limits, and feature availability.
          </p>
        </div>
      </section>

      {/* Comparison table */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
                  <th className="text-left px-4 py-3 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider w-40">
                    Feature
                  </th>
                  {plans.map((plan) => (
                    <th
                      key={plan.name}
                      className="text-center px-4 py-3 text-xs font-bold uppercase tracking-wider"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        {plan.name === "Pro" && (
                          <Crown className="h-3 w-3 text-cyan-500" />
                        )}
                        {plan.name === "Plus" && (
                          <Zap className="h-3 w-3 text-amber-500" />
                        )}
                        {plan.name}
                      </div>
                      <div className="text-[var(--color-text-secondary)] font-normal mt-0.5">
                        {plan.price}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {features.map((feature) => (
                  <tr
                    key={feature.key}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="px-4 py-3 font-medium text-[var(--color-text-secondary)]">
                      {feature.label}
                    </td>
                    {plans.map((plan) => (
                      <td
                        key={plan.name}
                        className="px-4 py-3 text-center"
                      >
                        <div className="flex items-center justify-center">
                          <CellValue
                            value={
                              plan[feature.key as keyof typeof plan]
                            }
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* FAQ-style notes */}
      <section className="pb-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Common questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: "What counts toward my storage?",
                a: "Storage is measured by the size of your encrypted files on the storage backend. Compression usually reduces this below the original file size. Metadata (file names, hashes) does not count.",
              },
              {
                q: "What is the max file size?",
                a: "Free accounts can upload files up to 500 MB. Plus supports up to 5 GB, and Pro up to 25 GB. Files are automatically chunked, so you will not notice any difference during upload.",
              },
              {
                q: "What does concurrent uploads mean?",
                a: "This is how many files you can upload at the same time. Free allows 2 simultaneous uploads. Pro has no limit.",
              },
              {
                q: "Can I upgrade or downgrade?",
                a: "Yes. Upgrades take effect immediately. Downgrades take effect at the end of your billing cycle. If you downgrade and exceed the new plan's storage limit, existing files remain accessible but you cannot upload new ones.",
              },
              {
                q: "What is BYOB?",
                a: "Bring Your Own Backend lets Pro users connect their own GitHub, GitLab, or Hugging Face repositories as storage. Your data stays on infrastructure you control.",
              },
            ].map((item, i) => (
              <div
                key={i}
                className="pl-5 border-l-2 border-[var(--color-border)]"
              >
                <h3 className="text-sm font-bold mb-1">{item.q}</h3>
                <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
                  {item.a}
                </p>
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
              href="/pricing"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Pricing
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                See pricing details and sign up for a plan.
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
                Create your account and upload your first encrypted file.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
