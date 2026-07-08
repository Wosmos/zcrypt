"use client";

import Link from "next/link";
import { LegalPage, LegalCta } from "@/components/marketing/legal-page";
import { Section, PullQuote, BulletList } from "@/components/marketing/prose";

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      lead="The rules of engagement. Plain language, no legalese traps. Last updated March 2026."
    >
      {/* Service Description */}
      <Section className="mt-16">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          1. Service Description
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            zcrypt is a zero-knowledge encrypted cloud storage platform. Files are
            encrypted client-side using AES-256-GCM before upload. We do not have
            access to your encryption keys or the contents of your files.
          </p>
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of zcrypt
            (&ldquo;the Service&rdquo;), operated by zcrypt (&ldquo;we&rdquo;,
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
            "One person or entity may not maintain more than one account.",
          ]}
        />
      </Section>

      {/* Free and Open Source */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          3. Free and Open Source
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            zcrypt is free and open source. There are no paid plans, subscriptions,
            or billing. Your storage capacity is bounded only by the free space
            available on the platform account you connect &mdash; there are no
            artificial limits imposed by zcrypt.
          </p>
        </div>
      </Section>

      {/* Acceptable Use */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          4. Acceptable Use
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>You agree not to:</p>
        </div>
        <BulletList
          items={[
            "Use the Service for any illegal purpose or to store illegal content.",
            "Attempt to circumvent rate limits or abuse-prevention measures.",
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
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            All users may connect their own storage accounts (GitHub, GitLab,
            Hugging Face, or Telegram). When using BYOB:
          </p>
        </div>
        <BulletList
          items={[
            "You are solely responsible for the storage platform’s terms of service and costs.",
            "zcrypt acts only as an encryption and chunking layer; we do not control or guarantee the availability of your storage backend.",
            "We are not liable for data loss caused by third-party platform changes, outages, or account suspensions.",
          ]}
        />
      </Section>

      {/* Zero-Knowledge */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          6. Zero-Knowledge Disclaimer
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            zcrypt uses client-side encryption. We <strong className="text-[var(--color-text)]">cannot</strong> access,
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
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            Your use of the Service is also governed by our{" "}
            <Link
              href="/privacy"
              className="text-cyan-600 dark:text-cyan-400 hover:underline font-medium"
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
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            You retain all rights to your files. zcrypt&apos;s source code is open
            source. The zcrypt name, logo, and branding are our intellectual property.
          </p>
        </div>
      </Section>

      {/* Liability */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          9. Limitation of Liability
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranties of any
            kind. To the maximum extent permitted by law:
          </p>
        </div>
        <BulletList
          items={[
            "We are not liable for data loss, including loss due to forgotten passphrases, platform outages, or service discontinuation.",
            "Because the Service is provided free of charge, our aggregate liability to you is limited to USD $100.",
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
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
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
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            Questions about these Terms? Contact us at{" "}
            <a
              href="mailto:legal@zcrypt.cloud"
              className="text-cyan-600 dark:text-cyan-400 hover:underline font-medium"
            >
              legal@zcrypt.cloud
            </a>.
          </p>
        </div>
      </Section>

      {/* CTA */}
      <LegalCta seeAlsoHref="/privacy" seeAlsoLabel="Privacy Policy" />
    </LegalPage>
  );
}
