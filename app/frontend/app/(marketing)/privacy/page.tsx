"use client";

import { LegalPage, LegalCta } from "@/components/marketing/legal-page";
import { Section, PullQuote, BulletList } from "@/components/marketing/prose";

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      lead="What we can see, what we collect, and what we'll never touch. Last updated March 2026."
    >
      {/* Intro */}
      <Section className="mt-16">
        <div className="space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            zcrypt is built on a zero-knowledge architecture. This means we are
            technically unable to access the contents of your encrypted files.
            This Privacy Policy explains what we <em>can</em> see, what we collect,
            and how we use it.
          </p>
        </div>
      </Section>

      {/* What We Cannot See */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          1. What We Cannot See
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>Due to our zero-knowledge encryption design:</p>
        </div>
        <BulletList
          items={[
            <><strong className="text-[var(--color-text)]">File contents</strong> — encrypted client-side with AES-256-GCM before upload.</>,
            <><strong className="text-[var(--color-text)]">Your passphrase</strong> — never transmitted to or stored on our servers.</>,
            <><strong className="text-[var(--color-text)]">Encryption keys</strong> — derived locally on your device from your passphrase.</>,
          ]}
        />

        <PullQuote>
          We can&apos;t read your files. Not because of a policy — because of
          mathematics.
        </PullQuote>
      </Section>

      {/* What We Collect */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          2. What We Collect
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>We collect the minimum data necessary to operate the Service.</p>
        </div>

        <div className="mt-8">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">
            Account Information
          </h3>
          <BulletList
            items={[
              "Email address (for authentication and service communications)",
              "Username",
              "Hashed password (bcrypt; we never store plaintext passwords)",
              "OAuth provider IDs (if you sign in with Google or GitHub)",
            ]}
          />
        </div>

        <div className="mt-8">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">
            Usage Metadata
          </h3>
          <BulletList
            items={[
              "Original file names (stored as metadata so you can browse and manage your files — the file contents themselves are always encrypted)",
              "File sizes (encrypted size, for storage-usage display)",
              "Upload/download timestamps",
              "Storage usage per account",
              "Number of files and chunks",
            ]}
          />
        </div>

        <div className="mt-8">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">
            Security Logs
          </h3>
          <BulletList
            items={[
              "IP addresses (for rate limiting and abuse prevention)",
              "Login timestamps and authentication events",
              "User agent strings",
            ]}
          />
        </div>
      </Section>

      {/* Platform Tokens */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          3. Platform Tokens
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            When you connect a storage platform (GitHub, GitLab, Hugging Face,
            Telegram), your platform access token is encrypted at rest using AES-256-GCM
            with a key derived from our master key. Tokens are only decrypted
            in memory during active upload/download operations.
          </p>
        </div>
      </Section>

      {/* How We Use Your Data */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          4. How We Use Your Data
        </h2>
        <BulletList
          items={[
            "To provide and maintain the Service",
            "To enforce rate limits and prevent abuse",
            "To send essential account communications (verification, password reset)",
            "To detect and prevent abuse",
            "To improve the Service (aggregate, anonymized usage statistics only)",
          ]}
        />
      </Section>

      {/* What We Do NOT Do */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          5. What We Do NOT Do
        </h2>
        <BulletList
          items={[
            <><strong className="text-[var(--color-text)]">We do not</strong> sell your data to third parties.</>,
            <><strong className="text-[var(--color-text)]">We do not</strong> serve advertisements.</>,
            <><strong className="text-[var(--color-text)]">We do not</strong> track you across websites.</>,
            <><strong className="text-[var(--color-text)]">We do not</strong> scan your files for any purpose (we cannot — they are encrypted).</>,
          ]}
        />

        <PullQuote>
          No ads, no tracking, no data sales. Your data isn&apos;t our product —
          the service is.
        </PullQuote>

        <div className="space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            We do not share data with law enforcement without valid legal process,
            and even then, we can only provide account metadata — not file contents.
          </p>
        </div>
      </Section>

      {/* Third-Party Services */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          6. Third-Party Services
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>We use the following third-party services:</p>
        </div>
        <BulletList
          items={[
            <><strong className="text-[var(--color-text)]">Neon</strong> — PostgreSQL database hosting (stores account metadata, not file contents)</>,
            <><strong className="text-[var(--color-text)]">Vercel</strong> — Frontend hosting</>,
            <><strong className="text-[var(--color-text)]">Railway</strong> — Backend hosting</>,
            <><strong className="text-[var(--color-text)]">Resend</strong> — Transactional email (verification, password reset)</>,
          ]}
        />
        <div className="mt-4 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            Your encrypted files are stored on the platforms you connect
            (GitHub, GitLab, Hugging Face, Telegram). Those platforms&apos; privacy
            policies apply to the storage of encrypted data on their infrastructure.
          </p>
        </div>
      </Section>

      {/* Data Retention */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          7. Data Retention
        </h2>
        <BulletList
          items={[
            "Account data is retained while your account is active.",
            "Upon account deletion, your metadata is removed within 30 days.",
            "Encrypted files on managed storage are scheduled for deletion upon account closure.",
            "Security logs are retained for up to 90 days.",
            "BYOB data remains on your infrastructure — you control its lifecycle.",
          ]}
        />
      </Section>

      {/* Your Rights */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          8. Your Rights
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>You have the right to:</p>
        </div>
        <BulletList
          items={[
            <><strong className="text-[var(--color-text)]">Access</strong> your account data (available in Settings)</>,
            <><strong className="text-[var(--color-text)]">Delete</strong> your account and all associated data</>,
            <><strong className="text-[var(--color-text)]">Export</strong> your files at any time (they are always downloadable)</>,
            <><strong className="text-[var(--color-text)]">Correct</strong> your account information</>,
          ]}
        />
        <div className="mt-4 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            For GDPR, CCPA, or other data protection requests, contact{" "}
            <a
              href="mailto:privacy@zcrypt.cloud"
              className="text-cyan-600 dark:text-cyan-400 hover:underline font-medium"
            >
              privacy@zcrypt.cloud
            </a>.
          </p>
        </div>
      </Section>

      {/* Children */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          9. Children
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            zcrypt is not intended for users under 16. We do not knowingly collect
            data from children under 16.
          </p>
        </div>
      </Section>

      {/* Changes */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          10. Changes
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            We may update this Privacy Policy. Significant changes will be
            communicated via email or in-app notification at least 30 days
            before taking effect.
          </p>
        </div>
      </Section>

      {/* Contact */}
      <Section className="mt-20">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">
          11. Contact
        </h2>
        <div className="mt-6 space-y-4 text-base text-[var(--color-text-secondary)] leading-relaxed">
          <p>
            Privacy questions? Contact us at{" "}
            <a
              href="mailto:privacy@zcrypt.cloud"
              className="text-cyan-600 dark:text-cyan-400 hover:underline font-medium"
            >
              privacy@zcrypt.cloud
            </a>.
          </p>
        </div>
      </Section>

      {/* CTA */}
      <LegalCta seeAlsoHref="/terms" seeAlsoLabel="Terms of Service" />
    </LegalPage>
  );
}
