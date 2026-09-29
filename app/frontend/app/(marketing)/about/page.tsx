import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Github, MapPin, ShieldCheck } from "@/lib/icons";
import {
  ProseSection,
  PullQuote,
  proseBody,
  proseHeadSize,
  proseLink,
  readingArticle,
  readingWidth,
} from "@/components/marketing/prose";
import { Section } from "@/components/marketing/section-reveal";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { PillLink } from "@/components/marketing/ui/pill-link";
import { IconWell, MarketingCard, cardSurfaceSm } from "@/components/marketing/ui/card";
import { WOSMO, WOSMO_SOCIALS, WosmoWordmark } from "@/components/marketing/wosmo";
import { PersonJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { about } from "./_data/about";
import { SITE_URL } from "@/lib/site";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "About. The person behind zcrypt",
  description:
    "zcrypt is built by Wasif Malik (Wosmo), a full-stack engineer from Karachi. A privacy tool should tell you who's behind it, so here I am. My story, the other things I've built, and how to reach me.",
  alternates: {
    canonical: `${SITE_URL}/about`,
  },
  openGraph: {
    title: "About. The person behind zcrypt",
    description:
      "zcrypt isn't a faceless company. It's built by one engineer, in the open. Meet Wasif Malik (Wosmo).",
    url: `${SITE_URL}/about`,
  },
};

const chip =
  "inline-flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--color-text-secondary)]";

export default function AboutPage() {
  return (
    <>
      <PersonJsonLd />
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "About", url: `${SITE_URL}/about` },
        ]}
      />

      <PageHero
        align="left"
        className={readingWidth}
        badge={<WosmoWordmark className="mb-8 h-8 w-auto text-[var(--color-text)]" />}
        eyebrow={about.hero.eyebrow}
        title={about.hero.title}
        lede={about.hero.subtext}
        actions={
          <>
            <PillLink href={WOSMO.portfolio} external>
              {about.hero.primaryLabel}
            </PillLink>
            <PillLink href={WOSMO.github} external variant="secondary" icon={Github}>
              {about.hero.secondaryLabel}
            </PillLink>
          </>
        }
      >
        <div className="mt-8 flex flex-wrap items-center gap-2.5">
          <span className={chip}>
            <MapPin className="h-3.5 w-3.5 text-[var(--pv2-accent-ink)]" />
            {WOSMO.location}
          </span>
          <span className={chip}>{WOSMO.role}</span>
          <span className={chip}>Building in the open</span>
        </div>
      </PageHero>

      <article className={cn(readingArticle, "pb-24")}>
        <Section>
          <MarketingCard className="flex flex-col gap-4 p-6 sm:flex-row sm:p-8">
            <IconWell icon={ShieldCheck} />
            <div>
              <p className="pv2-eyebrow">{about.trust.eyebrow}</p>
              <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
                {about.trust.body}
              </p>
            </div>
          </MarketingCard>
        </Section>

        <ProseSection id="about-origin" eyebrow={about.origin.eyebrow} title={about.origin.heading}>
          <div className={proseBody}>
            {about.origin.paragraphsBeforeQuote.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <PullQuote>{about.origin.pullQuote}</PullQuote>
          <div className={proseBody}>
            {about.origin.paragraphsAfterQuote.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <Link
            href="/philosophy"
            className={cn(proseLink, "mt-6 inline-flex items-center gap-1.5 text-sm")}
          >
            {about.origin.philosophyLinkLabel}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </ProseSection>

        <ProseSection
          id="about-projects"
          eyebrow={about.projects.eyebrow}
          title={about.projects.heading}
        >
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            {about.projects.intro}
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {about.projects.items.map((p) => (
              <a
                key={p.name}
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(cardSurfaceSm, "pv2-card-link group block p-5")}
              >
                <div className="flex items-center justify-between">
                  <h3 className="pv2-h3">{p.name}</h3>
                  <ArrowUpRight className="h-4 w-4 text-[var(--pv2-accent-ink)] opacity-0 transition-opacity group-hover:opacity-100" />
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--color-text-secondary)]">
                  {p.blurb}
                </p>
                <p className="mt-3 font-mono text-[11px] tracking-tight text-[var(--color-text-muted)]">
                  {p.stack}
                </p>
              </a>
            ))}
          </div>

          <a
            href={WOSMO.portfolio}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(proseLink, "mt-8 inline-flex items-center gap-1.5 text-sm")}
          >
            {about.projects.portfolioLinkLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </ProseSection>

        <ProseSection id="about-stack" eyebrow={about.stack.eyebrow} title={about.stack.heading}>
          <p className="text-base leading-relaxed text-[var(--color-text-secondary)]">
            {about.stack.intro}
          </p>
          <div className="mt-6 flex flex-wrap gap-2.5">
            {about.stack.items.map((tech) => (
              <span key={tech} className={chip}>
                {tech}
              </span>
            ))}
          </div>
        </ProseSection>

        <Section className="mt-24">
          <MarketingCard className="px-6 py-10 text-center sm:px-10 sm:py-12">
            <WosmoWordmark className="mx-auto mb-8 h-8 w-auto text-[var(--color-text)]" />
            <SectionHead
              id="about-contact"
              eyebrow={about.cta.eyebrow}
              title={about.cta.heading}
              lede={about.cta.body}
              className={cn("mb-0!", proseHeadSize)}
            />
            <div className="mt-8 flex flex-wrap justify-center gap-2.5">
              {WOSMO_SOCIALS.map(({ label, href, Icon }) => {
                const mail = href.startsWith("mailto:");
                return (
                  <a
                    key={label}
                    href={href}
                    target={mail ? undefined : "_blank"}
                    rel={mail ? undefined : "noopener noreferrer"}
                    className={cn(
                      chip,
                      "px-4 py-2.5 transition-colors hover:border-[var(--color-border-hover)] hover:text-[var(--color-text)]",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </a>
                );
              })}
            </div>
          </MarketingCard>
        </Section>
      </article>
    </>
  );
}
