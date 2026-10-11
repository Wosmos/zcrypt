import { LegalPage, ProseSection } from "@/components/legal/legal-i18n";
import { BulletList, PullQuote, proseBody, proseLink } from "@/components/marketing/prose";
import { LEGAL_EMAIL } from "@/lib/site";

import { T } from "@/components/i18n/t";
export default function TermsPage() {
  return (
    <LegalPage
      eyebrowK="legal.terms.a55"
      titleK="legal.terms.a56"
      leadK="legal.terms.a57"
      seeAlso={{ href: "/privacy", label: "legal.terms.a58" }}
    >
      <ProseSection
        id="terms-service-description"
        eyebrowK="legal.terms.a3"
        titleK="legal.terms.a4"
      >
        <div className={proseBody}>
          <p>
            <T k="legal.terms.p1" />
          </p>
          <p>
            <T k="legal.terms.p2" />
          </p>
        </div>
      </ProseSection>

      <ProseSection id="terms-accounts" eyebrowK="legal.terms.a9" titleK="legal.terms.a10">
        <BulletList
          items={[
            <T key="legal.terms.p5" k="legal.terms.p5" />,
            <T key="legal.terms.p6" k="legal.terms.p6" />,
            <T key="legal.terms.p7" k="legal.terms.p7" />,
            <T key="legal.terms.p8" k="legal.terms.p8" />,
          ]}
        />
      </ProseSection>

      <ProseSection
        id="terms-free-and-open-source"
        eyebrowK="legal.terms.a12"
        titleK="legal.terms.a13"
      >
        <div className={proseBody}>
          <p>
            <T k="legal.terms.p11" />
          </p>
        </div>
      </ProseSection>

      <ProseSection id="terms-acceptable-use" eyebrowK="legal.terms.a20" titleK="legal.terms.a21">
        <div className={proseBody}>
          <p>
            <T k="legal.terms.p14" />
          </p>
        </div>
        <BulletList
          items={[
            <T key="legal.terms.p15" k="legal.terms.p15" />,
            <T key="legal.terms.p16" k="legal.terms.p16" />,
            <T key="legal.terms.p17" k="legal.terms.p17" />,
            <T key="legal.terms.p18" k="legal.terms.p18" />,
            <T key="legal.terms.p19" k="legal.terms.p19" />,
          ]}
        />
      </ProseSection>

      <ProseSection
        id="terms-bring-your-own-backend"
        eyebrowK="legal.terms.a26"
        titleK="legal.terms.a27"
      >
        <div className={proseBody}>
          <p>
            <T k="legal.terms.p22" />
          </p>
        </div>
        <BulletList
          items={[
            <T key="legal.terms.p23" k="legal.terms.p23" />,
            <T key="legal.terms.p24" k="legal.terms.p24" />,
            <T key="legal.terms.p25" k="legal.terms.p25" />,
          ]}
        />
      </ProseSection>

      <ProseSection
        id="terms-zero-knowledge-disclaimer"
        eyebrowK="legal.terms.a31"
        titleK="legal.terms.a32"
      >
        <div className={proseBody}>
          <p>
            <T k="legal.terms.p28" />
          </p>
          <p>
            <T k="legal.terms.p29" />
          </p>
        </div>

        <PullQuote>
          <T k="legal.terms.p30" />
        </PullQuote>
      </ProseSection>

      <ProseSection id="terms-data-privacy" eyebrowK="legal.terms.a34" titleK="legal.terms.a35">
        <div className={proseBody}>
          <p>
            <T k="legal.terms.p33" links={{ l1: "/privacy" }} />
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="terms-intellectual-property"
        eyebrowK="legal.terms.a37"
        titleK="legal.terms.a38"
      >
        <div className={proseBody}>
          <p>
            <T k="legal.terms.p36" />
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="terms-limitation-of-liability"
        eyebrowK="legal.terms.a43"
        titleK="legal.terms.a44"
      >
        <div className={proseBody}>
          <p>
            <T k="legal.terms.p39" />
          </p>
        </div>
        <BulletList
          items={[
            <T key="legal.terms.p40" k="legal.terms.p40" />,
            <T key="legal.terms.p41" k="legal.terms.p41" />,
            <T key="legal.terms.p42" k="legal.terms.p42" />,
          ]}
        />
      </ProseSection>

      <ProseSection id="terms-termination" eyebrowK="legal.terms.a48" titleK="legal.terms.a49">
        <BulletList
          items={[
            <T key="legal.terms.p45" k="legal.terms.p45" />,
            <T key="legal.terms.p46" k="legal.terms.p46" />,
            <T key="legal.terms.p47" k="legal.terms.p47" />,
          ]}
        />
      </ProseSection>

      <ProseSection id="terms-changes-to-terms" eyebrowK="legal.terms.a51" titleK="legal.terms.a52">
        <div className={proseBody}>
          <p>
            <T k="legal.terms.p50" />
          </p>
        </div>
      </ProseSection>

      <ProseSection id="terms-contact" eyebrowK="legal.terms.a53" titleK="legal.terms.a54">
        <div className={proseBody}>
          <p>
            <T
              k="legal.terms.contactMail"
              values={{ email: LEGAL_EMAIL }}
              links={{ l1: `mailto:${LEGAL_EMAIL}` }}
              linkClassName={proseLink}
            />
          </p>
        </div>
      </ProseSection>
    </LegalPage>
  );
}
