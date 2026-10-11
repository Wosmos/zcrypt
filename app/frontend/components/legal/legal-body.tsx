import { T } from "@/components/i18n/t";
import { LegalPage, ProseSection } from "@/components/legal/legal-i18n";
import { BulletList, proseBody, proseLink } from "@/components/marketing/prose";
import { Section } from "@/components/marketing/section-reveal";

export type LegalBlock = { p: string } | { h: string } | { ul: string[] } | { mail: true };

export interface LegalSectionSpec {
  id: string;
  key: string;
  blocks: LegalBlock[];
}

const POLICIES_URL = "https://github.com/basecamp/policies";

export function LegalDocument({
  ns,
  seeAlso,
  email,
  sections,
}: {
  ns: "legal.privacy" | "legal.terms";
  seeAlso: string;
  email: string;
  sections: LegalSectionSpec[];
}) {
  return (
    <LegalPage
      eyebrowK={`${ns}.eyebrow`}
      titleK={`${ns}.title`}
      leadK={`${ns}.lead`}
      seeAlso={{ href: ns === "legal.privacy" ? "/terms" : "/privacy", label: seeAlso }}
    >
      {sections.map((s, i) => (
        <ProseSection
          key={s.id}
          id={s.id}
          eyebrowK="legal.sectionLabel"
          eyebrowValues={{ n: i + 1 }}
          titleK={`${ns}.${s.key}.t`}
        >
          {s.blocks.map((b) => {
            if ("ul" in b) {
              return (
                <BulletList
                  key={b.ul.join()}
                  items={b.ul.map((k) => <T key={k} k={`${ns}.${s.key}.${k}`} />)}
                />
              );
            }
            if ("h" in b) {
              return (
                <h3
                  key={b.h}
                  className="mt-8 font-heading text-lg font-bold tracking-tight text-[var(--color-text)]"
                >
                  <T k={`${ns}.${s.key}.${b.h}`} />
                </h3>
              );
            }
            if ("mail" in b) {
              return (
                <div key="mail" className={proseBody}>
                  <p>
                    <T
                      k={`${ns}.contactMail`}
                      values={{ email }}
                      links={{ l1: `mailto:${email}` }}
                      linkClassName={proseLink}
                    />
                  </p>
                </div>
              );
            }
            return (
              <div key={b.p} className={`mt-4 first:mt-0 ${proseBody}`}>
                <p>
                  <T
                    k={`${ns}.${s.key}.${b.p}`}
                    links={{ l1: "/privacy" }}
                    linkClassName={proseLink}
                  />
                </p>
              </div>
            );
          })}
        </ProseSection>
      ))}
      <Section>
        <div className={proseBody}>
          <p className="text-sm">
            <T k="legal.attribution" links={{ l1: POLICIES_URL }} linkClassName={proseLink} />
          </p>
        </div>
      </Section>
    </LegalPage>
  );
}
