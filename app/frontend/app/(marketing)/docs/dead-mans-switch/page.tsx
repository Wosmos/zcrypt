import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  Clock,
  Shield,
  Mail,
  AlertTriangle,
  Check,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";

export const metadata: Metadata = {
  title: "Dead Man's Switch | zcrypt Docs",
  description:
    "Set up a Dead Man's Switch in zcrypt to automatically notify a trusted contact if you stop checking in. Configurable timeout, custom messages, and optional file listing.",
  keywords: [
    "dead man's switch",
    "dead mans switch",
    "emergency contact",
    "trusted contact notification",
    "automatic alert",
    "zcrypt dead man switch",
    "digital legacy",
    "inactivity alert",
  ],
  alternates: {
    canonical: "https://zcrypt.cloud/docs/dead-mans-switch",
  },
  openGraph: {
    title: "Dead Man's Switch | zcrypt Docs",
    description:
      "Automatically notify a trusted contact if you stop checking in. Unique privacy feature by zcrypt.",
    url: "https://zcrypt.cloud/docs/dead-mans-switch",
  },
};

const timeoutOptions = [
  { days: "7 days", useCase: "High-risk situations, frequent travelers" },
  { days: "14 days", useCase: "Regular monitoring" },
  { days: "30 days", useCase: "Standard use (recommended)" },
  { days: "60 days", useCase: "Casual users" },
  { days: "90 days", useCase: "Long-term safety net" },
  { days: "180 days", useCase: "Very low frequency" },
  { days: "365 days", useCase: "Annual check-in" },
];

export default function DeadMansSwitchPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: "https://zcrypt.cloud" },
          { name: "Documentation", url: "https://zcrypt.cloud/docs" },
          {
            name: "Dead Man's Switch",
            url: "https://zcrypt.cloud/docs/dead-mans-switch",
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
            Dead Man&apos;s Switch
          </h1>
          <p className="mt-3 text-lg text-[var(--color-text-secondary)] max-w-2xl leading-relaxed">
            Automatically notify a trusted contact if you stop checking in.
            Designed for journalists, activists, and anyone who needs a digital
            safety net.
          </p>
        </div>
      </section>

      {/* What it is */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <Bell className="h-5 w-5 text-amber-500" />
              </div>
              <h2 className="text-lg font-bold">How it works</h2>
            </div>
            <div className="space-y-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
              <p>
                A Dead Man&apos;s Switch is a timer that runs in the background.
                You choose a timeout period (anywhere from 7 to 365 days) and
                designate a trusted contact. As long as you keep checking in,
                nothing happens. If the timer runs out without a check-in, zcrypt
                automatically sends a notification to your contact.
              </p>
              <p>
                Every time you log into zcrypt, your timer resets automatically.
                You can also check in manually from Settings at any time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Setup steps */}
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
                title: "Open settings",
                desc: "Go to Settings, then scroll to the Dead Man's Switch section, or navigate directly to /settings/deadman.",
              },
              {
                step: "2",
                title: "Add your trusted contact",
                desc: "Enter the email address of the person you want notified. You can also add their name and a custom message they will receive.",
              },
              {
                step: "3",
                title: "Choose a timeout",
                desc: "Select how many days can pass without a check-in before the switch triggers. Options range from 7 days to 365 days.",
              },
              {
                step: "4",
                title: "Optional: include file listing",
                desc: "Toggle whether the notification should include a list of your encrypted files. The files remain encrypted, but your contact will know what exists in your vault.",
              },
              {
                step: "5",
                title: "Activate",
                desc: "Save and enable the switch. Your timer starts immediately. Every login resets it.",
              },
            ].map((item) => (
              <div key={item.step} className="flex gap-4">
                <div className="flex-shrink-0 h-7 w-7 rounded-full bg-cyan-500/10 flex items-center justify-center">
                  <span className="text-xs font-bold text-cyan-600 dark:text-cyan-400">
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

      {/* Timeout options */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Timeout options
          </h2>
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface-1)]">
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Period
                  </th>
                  <th className="text-left px-4 py-2.5 text-xs font-bold text-[var(--color-text-muted)] uppercase tracking-wider">
                    Best for
                  </th>
                </tr>
              </thead>
              <tbody>
                {timeoutOptions.map((opt) => (
                  <tr
                    key={opt.days}
                    className="border-t border-[var(--color-border)]"
                  >
                    <td className="px-4 py-2.5 font-mono font-medium">
                      {opt.days}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">
                      {opt.useCase}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* What happens when triggered */}
      <section className="pb-12 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            What happens when it triggers
          </h2>
          <div className="space-y-3 text-sm text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              When the timeout expires without a check-in, zcrypt sends an email
              to your designated contact. The email includes your custom message
              and, if you opted in, a listing of the files in your vault.
            </p>
            <p>
              The files themselves stay encrypted. Your contact receives
              awareness that something may have happened, not access to your
              data. If you want them to access your files, you would need to
              share your passphrase with them separately through a secure
              channel.
            </p>
          </div>
          <div className="mt-4 px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
              <strong className="font-semibold">Note:</strong> The switch can be
              paused, reconfigured, or deleted at any time from Settings. Pausing
              stops the timer without removing your configuration.
            </p>
          </div>
        </div>
      </section>

      {/* Details */}
      <section className="pb-24 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
            <div className="h-1 w-1 rounded-full bg-cyan-500" />
            Details
          </h2>
          <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
            {[
              {
                label: "Check-in method",
                value: "Automatic on every login, or manual from Settings",
              },
              {
                label: "Notification",
                value: "Email to your trusted contact with custom message",
              },
              {
                label: "File listing",
                value:
                  "Optional. Shows file names and sizes but not file contents",
              },
              {
                label: "Privacy",
                value:
                  "Your contact never receives your passphrase or decryption keys",
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
        </div>
      </section>

      {/* Related */}
      <section className="py-16 px-4 bg-[var(--color-surface)]">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-xl font-bold mb-6">Related</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/docs/decoy-profile"
              className="card p-5 group hover:border-cyan-500/40 transition-colors"
            >
              <h3 className="text-sm font-bold mb-1 flex items-center gap-2">
                Decoy Profile
                <ArrowRight className="h-3 w-3 text-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Create a fake vault with a decoy password for plausible
                deniability.
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
                Understand the encryption and zero-knowledge architecture behind
                zcrypt.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
