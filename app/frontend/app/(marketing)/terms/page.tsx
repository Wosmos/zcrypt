import Link from "next/link";
import { LegalPage } from "@/components/marketing/legal-page";
import {
  BulletList,
  ProseSection,
  PullQuote,
  proseBody,
  proseLink,
} from "@/components/marketing/prose";
import { LEGAL_EMAIL } from "@/lib/site";

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      lead="The rules of engagement. Plain language, no legalese traps. Last updated March 2026."
      seeAlso={{ href: "/privacy", label: "Privacy Policy" }}
    >
      <ProseSection id="terms-service-description" eyebrow="Section 1" title="Service description">
        <div className={proseBody}>
          <p>
            zcrypt is a zero-knowledge encrypted cloud storage platform. Files are encrypted
            client-side using AES-256-GCM before upload. We do not have access to your encryption
            keys or the contents of your files.
          </p>
          <p>
            These Terms of Service (&ldquo;Terms&rdquo;) govern your use of zcrypt (&ldquo;the
            Service&rdquo;), operated by zcrypt (&ldquo;we&rdquo;, &ldquo;us&rdquo;,
            &ldquo;our&rdquo;). By creating an account or using the Service, you agree to these
            Terms.
          </p>
        </div>
      </ProseSection>

      <ProseSection id="terms-accounts" eyebrow="Section 2" title="Accounts">
        <BulletList
          items={[
            "You must provide accurate information when creating an account.",
            "You are responsible for maintaining the security of your account credentials and encryption passphrase.",
            "You must be at least 16 years old to use the Service.",
            "One person or entity may not maintain more than one account.",
          ]}
        />
      </ProseSection>

      <ProseSection
        id="terms-free-and-open-source"
        eyebrow="Section 3"
        title="Free and open source"
      >
        <div className={proseBody}>
          <p>
            zcrypt is free and open source. There are no paid plans, subscriptions, or billing. Your
            storage capacity is bounded only by the free space available on the platform account you
            connect. There are no artificial limits imposed by zcrypt.
          </p>
        </div>
      </ProseSection>

      <ProseSection id="terms-acceptable-use" eyebrow="Section 4" title="Acceptable use">
        <div className={proseBody}>
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
      </ProseSection>

      <ProseSection
        id="terms-bring-your-own-backend"
        eyebrow="Section 5"
        title="Bring your own backend"
      >
        <div className={proseBody}>
          <p>
            All users may connect their own storage accounts (GitHub, GitLab, Hugging Face, or
            Telegram). When using BYOB:
          </p>
        </div>
        <BulletList
          items={[
            "You are solely responsible for the storage platform’s terms of service and costs.",
            "zcrypt acts only as an encryption and chunking layer; we do not control or guarantee the availability of your storage backend.",
            "We are not liable for data loss caused by third-party platform changes, outages, or account suspensions.",
          ]}
        />
      </ProseSection>

      <ProseSection
        id="terms-zero-knowledge-disclaimer"
        eyebrow="Section 6"
        title="Zero-knowledge disclaimer"
      >
        <div className={proseBody}>
          <p>
            zcrypt uses client-side encryption. We{" "}
            <strong className="text-[var(--color-text)]">cannot</strong> access, read, recover, or
            reset your encryption passphrase or file contents. If you lose your passphrase, your
            data is permanently inaccessible.
          </p>
          <p>We strongly recommend using a password manager.</p>
        </div>

        <PullQuote>
          If you lose your passphrase, no one can help you. Not even us. That&apos;s the point.
        </PullQuote>
      </ProseSection>

      <ProseSection id="terms-data-privacy" eyebrow="Section 7" title="Data & privacy">
        <div className={proseBody}>
          <p>
            Your use of the Service is also governed by our{" "}
            <Link href="/privacy" className={proseLink}>
              Privacy Policy
            </Link>
            . We collect minimal account information and cannot access your encrypted file contents.
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="terms-intellectual-property"
        eyebrow="Section 8"
        title="Intellectual property"
      >
        <div className={proseBody}>
          <p>
            You retain all rights to your files. zcrypt&apos;s source code is open source. The
            zcrypt name, logo, and branding are our intellectual property.
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="terms-limitation-of-liability"
        eyebrow="Section 9"
        title="Limitation of liability"
      >
        <div className={proseBody}>
          <p>
            The Service is provided &ldquo;as is&rdquo; without warranties of any kind. To the
            maximum extent permitted by law:
          </p>
        </div>
        <BulletList
          items={[
            "We are not liable for data loss, including loss due to forgotten passphrases, platform outages, or service discontinuation.",
            "Because the Service is provided free of charge, our aggregate liability to you is limited to USD $100.",
            "We are not liable for indirect, incidental, or consequential damages.",
          ]}
        />
      </ProseSection>

      <ProseSection id="terms-termination" eyebrow="Section 10" title="Termination">
        <BulletList
          items={[
            "You may delete your account at any time.",
            "We may suspend or terminate accounts that violate these Terms.",
            "Upon termination, your encrypted data on managed storage will be deleted within 30 days. BYOB data remains on your own infrastructure.",
          ]}
        />
      </ProseSection>

      <ProseSection id="terms-changes-to-terms" eyebrow="Section 11" title="Changes to terms">
        <div className={proseBody}>
          <p>
            We may update these Terms with 30 days notice via email or in-app notification.
            Continued use after changes take effect constitutes acceptance.
          </p>
        </div>
      </ProseSection>

      <ProseSection id="terms-contact" eyebrow="Section 12" title="Contact">
        <div className={proseBody}>
          <p>
            Questions about these Terms? Contact us at{" "}
            <a href={`mailto:${LEGAL_EMAIL}`} className={proseLink}>
              {LEGAL_EMAIL}
            </a>
            .
          </p>
        </div>
      </ProseSection>
    </LegalPage>
  );
}
