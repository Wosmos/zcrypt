import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Cog,
  Layers,
  ShieldCheck,
  Clock,
  MonitorSmartphone,
  BarChart3,
  Download,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Advanced Usage | zcrypt Docs",
  description:
    "Advanced zcrypt features: vault snapshots, integrity verification, expiring files, device management, analytics dashboard, and bulk operations.",
  keywords: [
    "zcrypt advanced",
    "vault snapshots",
    "file integrity check",
    "expiring files",
    "device management",
    "zcrypt analytics",
    "bulk download",
    "bulk delete",
    "vault export",
  ],
  alternates: {
    canonical: "https://zcrypt.cloud/docs/advanced",
  },
  openGraph: {
    title: "Advanced Usage | zcrypt Docs",
    description:
      "Snapshots, integrity checks, expiring files, device management, analytics, and more.",
    url: "https://zcrypt.cloud/docs/advanced",
  },
};

const sections = [
  {
    id: "snapshots",
    icon: Layers,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    title: "Vault Snapshots",
    desc: "Save a point-in-time copy of your vault or individual files. If you accidentally delete or overwrite something, roll back to any previous snapshot.",
    steps: [
      "Go to Tools and open Snapshots",
      'Click "Create Snapshot" to capture the current state',
      "Browse previous snapshots to see what changed",
      "Restore any snapshot to return your vault to that point in time",
    ],
    details: [
      { label: "Scope", value: "Entire vault or individual files" },
      { label: "Retention", value: "Kept until you manually delete them" },
      { label: "Encrypted", value: "Snapshots are encrypted like all other data" },
    ],
  },
  {
    id: "integrity",
    icon: ShieldCheck,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    title: "Integrity Verification",
    desc: "Compare the SHA-256 hash of your stored files against the original hash recorded at upload time. Detects silent corruption, tampering, or bit rot.",
    steps: [
      "Go to Tools and open Integrity",
      "Select specific files or run a full vault check",
      "zcrypt downloads, decrypts, and hashes each file locally",
      "Results show which files pass and which have been modified",
    ],
    details: [
      { label: "Algorithm", value: "SHA-256" },
      { label: "Detects", value: "Corruption, tampering, bit rot" },
      { label: "Runs locally", value: "Hashing happens in your browser" },
    ],
  },
  {
    id: "expiring",
    icon: Clock,
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    title: "Expiring Files",
    desc: "Set any file to auto-delete after a specific time. When the timer runs out, the file is permanently removed from all storage backends.",
    steps: [
      "Upload a file or select an existing one",
      "Set an expiration (hours, days, or a custom date)",
      "The file works normally until the expiry time",
      "After expiry, the file is permanently and irreversibly deleted",
    ],
    details: [
      { label: "Options", value: "Hours, days, or a specific date" },
      { label: "Deletion", value: "Permanent across all backends" },
      { label: "Track", value: 'Tools > Expiring shows all timed files' },
    ],
  },
  {
    id: "devices",
    icon: MonitorSmartphone,
    color: "text-pink-500",
    bg: "bg-pink-500/10",
    title: "Device Management",
    desc: "View every active session on your account: browser, device type, IP address, and last activity. Revoke sessions you do not recognize.",
    steps: [
      "Go to Tools and open Devices",
      "Review the list of active sessions",
      "Check device type, browser, location, and last activity time",
      "Revoke any session you do not recognize",
    ],
    details: [
      { label: "Shows", value: "Browser, OS, IP, last active time" },
      { label: "Revoke", value: "Instantly terminates the session" },
      { label: "Safety", value: "Your current device is highlighted" },
    ],
  },
  {
    id: "analytics",
    icon: BarChart3,
    color: "text-cyan-500",
    bg: "bg-cyan-500/10",
    title: "Analytics Dashboard",
    desc: "Your dashboard includes an Insights tab with visual breakdowns of your vault usage.",
    steps: [
      "Open your Dashboard and switch to the Insights tab",
      "View file type distribution, compression efficiency, and storage usage over time",
      "See platform distribution showing where your files are stored",
      "Check download activity and most accessed files",
    ],
    details: [
      { label: "File types", value: "Breakdown by document, image, video, etc." },
      { label: "Compression", value: "How much space zstd compression saved" },
      { label: "Platform", value: "Distribution across GitHub, GitLab, Hugging Face" },
    ],
  },
  {
    id: "bulk",
    icon: Download,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    title: "Bulk Operations",
    desc: "Select multiple files at once to download as a ZIP or delete in bulk. Available from the dashboard file view.",
    steps: [
      "On the dashboard, use the checkboxes to select multiple files",
      'A floating action bar appears with "Download as ZIP" and "Delete" options',
      "Bulk download creates a ZIP file (max 2 GB) decrypted in your browser",
      "Bulk delete permanently removes all selected files after confirmation",
    ],
    details: [
      { label: "ZIP limit", value: "2 GB total" },
      { label: "Select all", value: "Available from the action bar" },
      { label: "Decryption", value: "Happens locally in your browser" },
    ],
  },
];

export default function AdvancedPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          {
            name: "Advanced Usage",
            url: "https://zcrypt.cloud/docs/advanced",
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
            Advanced Usage
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            Snapshots, integrity checks, expiring files, device management,
            analytics, and bulk operations.
          </p>
        </div>
      </section>

      {/* Quick nav */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-1)] transition-colors text-sm"
              >
                <s.icon className={`h-3.5 w-3.5 ${s.color}`} />
                <span className="font-medium">{s.title}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="pb-24 px-4">
        <div className="max-w-3xl mx-auto space-y-16">
          {sections.map((section) => (
            <div key={section.id} id={section.id} className="scroll-mt-24">
              <div className="flex items-start gap-4 mb-6">
                <div
                  className={`flex-shrink-0 flex items-center justify-center h-11 w-11 rounded-xl ${section.bg}`}
                >
                  <section.icon className={`h-5 w-5 ${section.color}`} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">{section.title}</h2>
                  <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">
                    {section.desc}
                  </p>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">
                  How to use it
                </h3>
                <ol className="space-y-2">
                  {section.steps.map((step, i) => (
                    <li
                      key={i}
                      className="flex gap-3 text-sm text-[var(--color-text-secondary)]"
                    >
                      <span className="flex-shrink-0 flex items-center justify-center h-5 w-5 rounded-full bg-[var(--color-surface-1)] text-[10px] font-bold">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>

              <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
                {section.details.map((d, i) => (
                  <div
                    key={i}
                    className={`flex items-start gap-4 px-4 py-3 text-sm ${
                      i !== 0 ? "border-t border-[var(--color-border)]" : ""
                    }`}
                  >
                    <span className="flex-shrink-0 w-28 font-medium text-[var(--color-text-secondary)]">
                      {d.label}
                    </span>
                    <span className="text-[var(--color-text)]">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Related */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Related</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/docs/tools"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Tools
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Send files, share text, and transfer between devices.
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
                Encryption, key derivation, and zero-knowledge architecture.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
