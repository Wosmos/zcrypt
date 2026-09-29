import { LegalPage } from "@/components/marketing/legal-page";
import {
  BulletList,
  ProseSection,
  PullQuote,
  proseBody,
  proseLink,
} from "@/components/marketing/prose";
import { Section } from "@/components/marketing/section-reveal";
import { PRIVACY_EMAIL } from "@/lib/site";

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy"
      title="Privacy Policy"
      lead="What we can see, what we collect, and what we'll never touch. Last updated July 2026."
      seeAlso={{ href: "/terms", label: "Terms of Service" }}
    >
      <Section>
        <div className={proseBody}>
          <p>
            zcrypt is built on a zero-knowledge architecture. This means we are technically unable
            to access the contents of your encrypted files. This Privacy Policy explains what we{" "}
            <em>can</em> see, what we collect, and how we use it.
          </p>
        </div>
      </Section>

      <ProseSection id="privacy-what-we-cannot-see" eyebrow="Section 1" title="What we cannot see">
        <div className={proseBody}>
          <p>Due to our zero-knowledge encryption design:</p>
        </div>
        <BulletList
          items={[
            <>
              <strong className="text-[var(--color-text)]">File contents</strong>, encrypted
              client-side with AES-256-GCM before upload.
            </>,
            <>
              <strong className="text-[var(--color-text)]">Your passphrase</strong>, never
              transmitted to or stored on our servers.
            </>,
            <>
              <strong className="text-[var(--color-text)]">Encryption keys</strong>, derived locally
              on your device from your passphrase.
            </>,
          ]}
        />

        <PullQuote>
          We can&apos;t read your files. Not because of a policy, because of mathematics.
        </PullQuote>
      </ProseSection>

      <ProseSection id="privacy-what-we-collect" eyebrow="Section 2" title="What we collect">
        <div className={proseBody}>
          <p>We collect the minimum data necessary to operate the Service.</p>
        </div>

        <div className="mt-8">
          <h3 className="font-heading text-lg font-bold tracking-tight text-[var(--color-text)]">
            Account information
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
          <h3 className="font-heading text-lg font-bold tracking-tight text-[var(--color-text)]">
            Usage metadata
          </h3>
          <BulletList
            items={[
              "File and folder names: encrypted client-side by default, so the server stores only an opaque name it cannot read (some older files may retain a plaintext name in a legacy column we are retiring)",
              "File sizes (encrypted size, for storage-usage display)",
              "Upload/download timestamps",
              "Storage usage per account",
              "Number of files and chunks",
            ]}
          />
        </div>

        <div className="mt-8">
          <h3 className="font-heading text-lg font-bold tracking-tight text-[var(--color-text)]">
            Security logs
          </h3>
          <BulletList
            items={[
              "IP addresses (for rate limiting and abuse prevention)",
              "Login timestamps and authentication events",
              "User agent strings",
            ]}
          />
        </div>
      </ProseSection>

      <ProseSection id="privacy-platform-tokens" eyebrow="Section 3" title="Platform tokens">
        <div className={proseBody}>
          <p>
            When you connect a storage platform (GitHub, GitLab, Hugging Face, Telegram), your
            platform access token is encrypted at rest using AES-256-GCM with a key derived from our
            master key. Tokens are only decrypted in memory during active upload/download
            operations.
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="privacy-how-we-use-your-data"
        eyebrow="Section 4"
        title="How we use your data"
      >
        <BulletList
          items={[
            "To provide and maintain the Service",
            "To enforce rate limits and prevent abuse",
            "To send essential account communications (verification, password reset)",
            "To detect and prevent abuse",
            "To improve the Service (aggregate, anonymized usage statistics only)",
          ]}
        />
      </ProseSection>

      <ProseSection id="privacy-what-we-do-not-do" eyebrow="Section 5" title="What we do NOT do">
        <BulletList
          items={[
            <>
              <strong className="text-[var(--color-text)]">We do not</strong> sell your data to
              third parties.
            </>,
            <>
              <strong className="text-[var(--color-text)]">We do not</strong> serve advertisements.
            </>,
            <>
              <strong className="text-[var(--color-text)]">We do not</strong> track you across
              websites.
            </>,
            <>
              <strong className="text-[var(--color-text)]">We do not</strong> scan your files for
              any purpose (we cannot. They are encrypted).
            </>,
          ]}
        />

        <PullQuote>
          No ads, no tracking, no data sales. Your data isn&apos;t our product, the service is.
        </PullQuote>

        <div className={proseBody}>
          <p>
            We do not share data with law enforcement without valid legal process, and even then, we
            can only provide account metadata, not file contents.
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="privacy-third-party-services"
        eyebrow="Section 6"
        title="Third-party services"
      >
        <div className={proseBody}>
          <p>We use the following third-party services:</p>
        </div>
        <BulletList
          items={[
            <>
              <strong className="text-[var(--color-text)]">Neon</strong>. PostgreSQL database
              hosting (stores account metadata, not file contents)
            </>,
            <>
              <strong className="text-[var(--color-text)]">Vercel</strong>. Frontend hosting
            </>,
            <>
              <strong className="text-[var(--color-text)]">Railway</strong>. Backend hosting
            </>,
            <>
              <strong className="text-[var(--color-text)]">Resend</strong>. Transactional email
              (verification, password reset)
            </>,
          ]}
        />
        <div className={`mt-4 ${proseBody}`}>
          <p>
            Your encrypted files are stored on the platforms you connect (GitHub, GitLab, Hugging
            Face, Telegram). Those platforms&apos; privacy policies apply to the storage of
            encrypted data on their infrastructure.
          </p>
        </div>
      </ProseSection>

      <ProseSection id="privacy-data-retention" eyebrow="Section 7" title="Data retention">
        <BulletList
          items={[
            "Account data is retained while your account is active.",
            "Upon account deletion, your metadata is removed within 30 days.",
            "Encrypted files on managed storage are scheduled for deletion upon account closure.",
            "Security logs are retained for up to 90 days.",
            "BYOB data remains on your infrastructure, you control its lifecycle.",
          ]}
        />
      </ProseSection>

      <ProseSection id="privacy-your-rights" eyebrow="Section 8" title="Your rights">
        <div className={proseBody}>
          <p>You have the right to:</p>
        </div>
        <BulletList
          items={[
            <>
              <strong className="text-[var(--color-text)]">Access</strong> your account data
              (available in Settings)
            </>,
            <>
              <strong className="text-[var(--color-text)]">Delete</strong> your account and all
              associated data
            </>,
            <>
              <strong className="text-[var(--color-text)]">Export</strong> your files at any time
              (they are always downloadable)
            </>,
            <>
              <strong className="text-[var(--color-text)]">Correct</strong> your account information
            </>,
          ]}
        />
        <div className={`mt-4 ${proseBody}`}>
          <p>
            For GDPR, CCPA, or other data protection requests, contact{" "}
            <a href={`mailto:${PRIVACY_EMAIL}`} className={proseLink}>
              {PRIVACY_EMAIL}
            </a>
            .
          </p>
        </div>
      </ProseSection>

      <ProseSection id="privacy-children" eyebrow="Section 9" title="Children">
        <div className={proseBody}>
          <p>
            zcrypt is not intended for users under 16. We do not knowingly collect data from
            children under 16.
          </p>
        </div>
      </ProseSection>

      <ProseSection id="privacy-changes" eyebrow="Section 10" title="Changes">
        <div className={proseBody}>
          <p>
            We may update this Privacy Policy. Significant changes will be communicated via email or
            in-app notification at least 30 days before taking effect.
          </p>
        </div>
      </ProseSection>

      <ProseSection id="privacy-contact" eyebrow="Section 11" title="Contact">
        <div className={proseBody}>
          <p>
            Privacy questions? Contact us at{" "}
            <a href={`mailto:${PRIVACY_EMAIL}`} className={proseLink}>
              {PRIVACY_EMAIL}
            </a>
            .
          </p>
        </div>
      </ProseSection>
    </LegalPage>
  );
}
