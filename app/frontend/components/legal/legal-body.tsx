import { T } from "@/components/i18n/t";
import { LegalPage, ProseSection } from "@/components/legal/legal-i18n";
import { BulletList, proseBody, proseLink } from "@/components/marketing/prose";
import { Section } from "@/components/marketing/section-reveal";
import { GITHUB_REPO } from "@/lib/config";

export type LegalBlock = { p: string } | { h: string } | { ul: string[] } | { mail: true };

export interface LegalSectionSpec {
  id: string;
  key: string;
  blocks: LegalBlock[];
}

const DBIP_URL = "https://db-ip.com";
const POLICIES_URL = "https://github.com/basecamp/policies";
const SIGNPATH_URL = "https://signpath.io";
const SIGNPATH_FOUNDATION_URL = "https://signpath.org";

const LINKS = {
  l1: "/privacy",
  dbip: DBIP_URL,
  signpath: SIGNPATH_URL,
  foundation: SIGNPATH_FOUNDATION_URL,
  repo: GITHUB_REPO,
  releases: `${GITHUB_REPO}/releases`,
};

const SEE_ALSO_HREF = {
  "legal.privacy": "/terms",
  "legal.terms": "/privacy",
  "legal.codeSigning": "/privacy",
} as const;

/** A legal page rendered from message keys under `ns`: a section per spec, then a contact line. */
export function LegalDocument({
  ns,
  seeAlso,
  email,
  sections,
}: {
  ns: keyof typeof SEE_ALSO_HREF;
  seeAlso: string;
  email: string;
  sections: LegalSectionSpec[];
}) {
  return (
    <LegalPage
      eyebrowK={`${ns}.eyebrow`}
      titleK={`${ns}.title`}
      leadK={`${ns}.lead`}
      seeAlso={{ href: SEE_ALSO_HREF[ns], label: seeAlso }}
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
                  items={b.ul.map((k) => (
                    <T key={k} k={`${ns}.${s.key}.${k}`} links={LINKS} linkClassName={proseLink} />
                  ))}
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
                  <T k={`${ns}.${s.key}.${b.p}`} links={LINKS} linkClassName={proseLink} />
                </p>
              </div>
            );
          })}
        </ProseSection>
      ))}
      {ns !== "legal.codeSigning" && (
        <Section>
          <div className={proseBody}>
            <p className="text-sm">
              <T k="legal.attribution" links={{ l1: POLICIES_URL }} linkClassName={proseLink} />
            </p>
          </div>
        </Section>
      )}
    </LegalPage>
  );
}
