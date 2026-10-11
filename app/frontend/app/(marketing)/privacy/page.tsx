import { LegalPage, ProseSection } from "@/components/legal/legal-i18n";
import { BulletList, PullQuote, proseBody, proseLink } from "@/components/marketing/prose";
import { Section } from "@/components/marketing/section-reveal";
import { PRIVACY_EMAIL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrowK="legal.privacy.a75"
      titleK="legal.privacy.a76"
      leadK="legal.privacy.a77"
      seeAlso={{ href: "/terms", label: "legal.privacy.a78" }}
    >
      <Section>
        <div className={proseBody}>
          <p>
            <T k="legal.privacy.p1" />
          </p>
        </div>
      </Section>

      <ProseSection
        id="privacy-what-we-cannot-see"
        eyebrowK="legal.privacy.a7"
        titleK="legal.privacy.a8"
      >
        <div className={proseBody}>
          <p>
            <T k="legal.privacy.p2" />
          </p>
        </div>
        <BulletList
          items={[
            <T key="legal.privacy.p3" k="legal.privacy.p3" />,
            <T key="legal.privacy.p4" k="legal.privacy.p4" />,
            <T key="legal.privacy.p5" k="legal.privacy.p5" />,
          ]}
        />

        <PullQuote>
          <T k="legal.privacy.p6" />
        </PullQuote>
      </ProseSection>

      <ProseSection
        id="privacy-what-we-collect"
        eyebrowK="legal.privacy.a25"
        titleK="legal.privacy.a26"
      >
        <div className={proseBody}>
          <p>
            <T k="legal.privacy.p9" />
          </p>
        </div>

        <div className="mt-8">
          <h3 className="font-heading text-lg font-bold tracking-tight text-[var(--color-text)]">
            <T k="legal.privacy.p10" />
          </h3>
          <BulletList
            items={[
              <T key="legal.privacy.p11" k="legal.privacy.p11" />,
              <T key="legal.privacy.p12" k="legal.privacy.p12" />,
              <T key="legal.privacy.p13" k="legal.privacy.p13" />,
              <T key="legal.privacy.p14" k="legal.privacy.p14" />,
            ]}
          />
        </div>

        <div className="mt-8">
          <h3 className="font-heading text-lg font-bold tracking-tight text-[var(--color-text)]">
            <T k="legal.privacy.p15" />
          </h3>
          <BulletList
            items={[
              <T key="legal.privacy.p16" k="legal.privacy.p16" />,
              <T key="legal.privacy.p17" k="legal.privacy.p17" />,
              <T key="legal.privacy.p18" k="legal.privacy.p18" />,
              <T key="legal.privacy.p19" k="legal.privacy.p19" />,
              <T key="legal.privacy.p20" k="legal.privacy.p20" />,
            ]}
          />
        </div>

        <div className="mt-8">
          <h3 className="font-heading text-lg font-bold tracking-tight text-[var(--color-text)]">
            <T k="legal.privacy.p21" />
          </h3>
          <BulletList
            items={[
              <T key="legal.privacy.p22" k="legal.privacy.p22" />,
              <T key="legal.privacy.p23" k="legal.privacy.p23" />,
              <T key="legal.privacy.p24" k="legal.privacy.p24" />,
            ]}
          />
        </div>
      </ProseSection>

      <ProseSection
        id="privacy-platform-tokens"
        eyebrowK="legal.privacy.a28"
        titleK="legal.privacy.a29"
      >
        <div className={proseBody}>
          <p>
            <T k="legal.privacy.p27" />
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="privacy-how-we-use-your-data"
        eyebrowK="legal.privacy.a35"
        titleK="legal.privacy.a36"
      >
        <BulletList
          items={[
            <T key="legal.privacy.p30" k="legal.privacy.p30" />,
            <T key="legal.privacy.p31" k="legal.privacy.p31" />,
            <T key="legal.privacy.p32" k="legal.privacy.p32" />,
            <T key="legal.privacy.p33" k="legal.privacy.p33" />,
            <T key="legal.privacy.p34" k="legal.privacy.p34" />,
          ]}
        />
      </ProseSection>

      <ProseSection
        id="privacy-what-we-do-not-do"
        eyebrowK="legal.privacy.a43"
        titleK="legal.privacy.a44"
      >
        <BulletList
          items={[
            <T key="legal.privacy.p37" k="legal.privacy.p37" />,
            <T key="legal.privacy.p38" k="legal.privacy.p38" />,
            <T key="legal.privacy.p39" k="legal.privacy.p39" />,
            <T key="legal.privacy.p40" k="legal.privacy.p40" />,
          ]}
        />

        <PullQuote>
          <T k="legal.privacy.p41" />
        </PullQuote>

        <div className={proseBody}>
          <p>
            <T k="legal.privacy.p42" />
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="privacy-third-party-services"
        eyebrowK="legal.privacy.a51"
        titleK="legal.privacy.a52"
      >
        <div className={proseBody}>
          <p>
            <T k="legal.privacy.p45" />
          </p>
        </div>
        <BulletList
          items={[
            <T key="legal.privacy.p46" k="legal.privacy.p46" />,
            <T key="legal.privacy.p47" k="legal.privacy.p47" />,
            <T key="legal.privacy.p48" k="legal.privacy.p48" />,
            <T key="legal.privacy.p49" k="legal.privacy.p49" />,
          ]}
        />
        <div className={`mt-4 ${proseBody}`}>
          <p>
            <T k="legal.privacy.p50" />
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="privacy-data-retention"
        eyebrowK="legal.privacy.a58"
        titleK="legal.privacy.a59"
      >
        <BulletList
          items={[
            <T key="legal.privacy.p53" k="legal.privacy.p53" />,
            <T key="legal.privacy.p54" k="legal.privacy.p54" />,
            <T key="legal.privacy.p55" k="legal.privacy.p55" />,
            <T key="legal.privacy.p56" k="legal.privacy.p56" />,
            <T key="legal.privacy.p57" k="legal.privacy.p57" />,
          ]}
        />
      </ProseSection>

      <ProseSection
        id="privacy-your-rights"
        eyebrowK="legal.privacy.a65"
        titleK="legal.privacy.a66"
      >
        <div className={proseBody}>
          <p>
            <T k="legal.privacy.p60" />
          </p>
        </div>
        <BulletList
          items={[
            <T key="legal.privacy.p61" k="legal.privacy.p61" />,
            <T key="legal.privacy.p62" k="legal.privacy.p62" />,
            <T key="legal.privacy.p63" k="legal.privacy.p63" />,
            <T key="legal.privacy.p64" k="legal.privacy.p64" />,
          ]}
        />
        <div className={`mt-4 ${proseBody}`}>
          <p>
            <T
              k="legal.privacy.contactRights"
              values={{ email: PRIVACY_EMAIL }}
              links={{ l1: `mailto:${PRIVACY_EMAIL}` }}
              linkClassName={proseLink}
            />
          </p>
        </div>
      </ProseSection>

      <ProseSection id="privacy-children" eyebrowK="legal.privacy.a68" titleK="legal.privacy.a69">
        <div className={proseBody}>
          <p>
            <T k="legal.privacy.p67" />
          </p>
        </div>
      </ProseSection>

      <ProseSection id="privacy-changes" eyebrowK="legal.privacy.a71" titleK="legal.privacy.a72">
        <div className={proseBody}>
          <p>
            <T k="legal.privacy.p70" />
          </p>
        </div>
      </ProseSection>

      <ProseSection id="privacy-contact" eyebrowK="legal.privacy.a73" titleK="legal.privacy.a74">
        <div className={proseBody}>
          <p>
            <T
              k="legal.privacy.contactMail"
              values={{ email: PRIVACY_EMAIL }}
              links={{ l1: `mailto:${PRIVACY_EMAIL}` }}
              linkClassName={proseLink}
            />
          </p>
        </div>
      </ProseSection>
    </LegalPage>
  );
}
