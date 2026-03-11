"use client";

import { useRef } from "react";
import Link from "next/link";
import { motion, useInView } from "motion/react";
import { ArrowRight } from "lucide-react";

function Section({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function PullQuote({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="my-12 border-l-2 border-emerald-500/40 pl-6 py-2">
      <p className="text-xl sm:text-2xl font-medium italic text-[var(--color-text)] leading-relaxed">
        {children}
      </p>
    </blockquote>
  );
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-4 space-y-2 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="text-emerald-500 mt-0.5 shrink-0">&bull;</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function TermsPage() {
  return (
    <div className="pt-28 pb-20">
      <article className="mx-auto max-w-2xl px-4">
        {/* Header */}
        <Section>
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-4">
            Legal
          </p>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-[1.15]">
            Terms of Service
          </h1>
          <p className="text-lg text-[var(--color-text-secondary)] mt-4 leading-relaxed">
            The rules of engagement. Plain language, no legalese traps.
            Last updated March 2026.
          </p>
          <div className="h-px bg-[var(--color-border)] mt-10" />
        </Section>

        {/* Service Description */}
        <Section className="mt-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            1. Service Description
          </h2>
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              zpush is a zero-knowledge encrypted cloud storage platform. Files are
              encrypted client-side using AES-256-GCM before upload. We do not have
              access to your encryption keys or the contents of your files.
            </p>
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your use of zpush
              (&ldquo;the Service&rdquo;), operated by zpush (&ldquo;we&rdquo;,
              &ldquo;us&rdquo;, &ldquo;our&rdquo;). By creating an account or using
              the Service, you agree to these Terms.
            </p>
          </div>
        </Section>

        {/* Accounts */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            2. Accounts
          </h2>
          <BulletList
            items={[
              "You must provide accurate information when creating an account.",
              "You are responsible for maintaining the security of your account credentials and encryption passphrase.",
              "You must be at least 16 years old to use the Service.",
              "One person or entity may not maintain more than one free account.",
            ]}
          />
        </Section>

        {/* Plans & Billing */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            3. Plans & Billing
          </h2>
          <BulletList
            items={[
              <><strong className="text-[var(--color-text)]">Free tier:</strong> 10 GB of encrypted storage at no cost.</>,
              <><strong className="text-[var(--color-text)]">Paid plans:</strong> Plus, Pro, and Team plans are available with additional storage and features. Pricing is listed on our website and may change with 30 days notice.</>,
              "Paid plans are billed monthly or annually. You may cancel at any time; access continues until the end of the billing period.",
              "We do not offer refunds for partial billing periods.",
            ]}
          />
        </Section>

        {/* Acceptable Use */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            4. Acceptable Use
          </h2>
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
            <p>You agree not to:</p>
          </div>
          <BulletList
            items={[
              "Use the Service for any illegal purpose or to store illegal content.",
              "Attempt to circumvent storage quotas or rate limits.",
              "Reverse-engineer, attack, or exploit the Service infrastructure.",
              "Share your account credentials with others.",
              "Use automated systems to create accounts or upload content in bulk beyond normal usage.",
            ]}
          />
        </Section>

        {/* BYOB */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            5. Bring Your Own Backend
          </h2>
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              Pro and Team users may connect their own Git-based storage repositories.
              When using BYOB:
            </p>
          </div>
          <BulletList
            items={[
              "You are solely responsible for the storage platform\u2019s terms of service and costs.",
              "zpush acts only as an encryption and chunking layer; we do not control or guarantee the availability of your storage backend.",
              "We are not liable for data loss caused by third-party platform changes, outages, or account suspensions.",
            ]}
          />
        </Section>

        {/* Zero-Knowledge */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            6. Zero-Knowledge Disclaimer
          </h2>
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              zpush uses client-side encryption. We <strong className="text-[var(--color-text)]">cannot</strong> access,
              read, recover, or reset your encryption passphrase or file contents.
              If you lose your passphrase, your data is permanently inaccessible.
            </p>
            <p>
              We strongly recommend using a password manager.
            </p>
          </div>

          <PullQuote>
            If you lose your passphrase, no one can help you. Not even us. That&apos;s
            the point.
          </PullQuote>
        </Section>

        {/* Data & Privacy */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            7. Data & Privacy
          </h2>
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              Your use of the Service is also governed by our{" "}
              <Link
                href="/privacy"
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
              >
                Privacy Policy
              </Link>
              . We collect minimal account information and cannot access your
              encrypted file contents.
            </p>
          </div>
        </Section>

        {/* Intellectual Property */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            8. Intellectual Property
          </h2>
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              You retain all rights to your files. zpush&apos;s source code is open
              source. The zpush name, logo, and branding are our intellectual property.
            </p>
          </div>
        </Section>

        {/* Liability */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            9. Limitation of Liability
          </h2>
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              The Service is provided &ldquo;as is&rdquo; without warranties of any
              kind. To the maximum extent permitted by law:
            </p>
          </div>
          <BulletList
            items={[
              "We are not liable for data loss, including loss due to forgotten passphrases, platform outages, or service discontinuation.",
              "Our total liability is limited to the amount you paid us in the 12 months preceding the claim.",
              "We are not liable for indirect, incidental, or consequential damages.",
            ]}
          />
        </Section>

        {/* Termination */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            10. Termination
          </h2>
          <BulletList
            items={[
              "You may delete your account at any time.",
              "We may suspend or terminate accounts that violate these Terms.",
              "Upon termination, your encrypted data on managed storage will be deleted within 30 days. BYOB data remains on your own infrastructure.",
            ]}
          />
        </Section>

        {/* Changes */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            11. Changes to Terms
          </h2>
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              We may update these Terms with 30 days notice via email or in-app
              notification. Continued use after changes take effect constitutes
              acceptance.
            </p>
          </div>
        </Section>

        {/* Contact */}
        <Section className="mt-20">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
            12. Contact
          </h2>
          <div className="mt-6 space-y-4 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
            <p>
              Questions about these Terms? Contact us at{" "}
              <a
                href="mailto:legal@zpush.io"
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
              >
                legal@zpush.io
              </a>.
            </p>
          </div>
        </Section>

        {/* CTA */}
        <Section className="mt-20 pt-10 border-t border-[var(--color-border)]">
          <div className="flex items-center justify-between">
            <p className="text-sm text-[var(--color-text-muted)]">
              See also:{" "}
              <Link
                href="/privacy"
                className="text-emerald-600 dark:text-emerald-400 hover:underline font-medium"
              >
                Privacy Policy
              </Link>
            </p>
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-8 py-3.5 text-sm font-semibold text-slate-900 hover:bg-emerald-400 transition-colors shadow-xl shadow-emerald-500/25"
            >
              Get started <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </Section>
      </article>
    </div>
  );
}
