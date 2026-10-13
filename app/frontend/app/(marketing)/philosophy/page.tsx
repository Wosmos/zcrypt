import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { ArrowUpRight } from "@/lib/icons";
import { ProseSection, PullQuote, ReadingPage, proseBody } from "@/components/marketing/prose";
import { Section } from "@/components/marketing/section-reveal";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { MarketingCard, cardSurface } from "@/components/marketing/ui/card";
import { WosmoWordmark } from "@/components/marketing/wosmo";
import { T } from "@/components/i18n/t";

export const metadata = pageMetadata({
  title: "Our Philosophy. Why We Built zcrypt",
  description:
    "The zcrypt manifesto. Why cloud storage is overpriced, why zero-knowledge encryption matters, and why your data should belong to you. Open source, free, and private.",
  path: "/philosophy",
  ogTitle: "Our Philosophy. Why We Built zcrypt",
  ogDescription:
    "The zcrypt manifesto. Cloud storage is overpriced. Your data should belong to you.",
});

export default function PhilosophyPage() {
  return (
    <ReadingPage
      eyebrow={<T k="site.philosophy.hero.eyebrow" />}
      title={<T k="site.philosophy.hero.title" />}
      highlight={<T k="site.philosophy.hero.highlight" />}
      lede={<T k="site.philosophy.hero.lede" />}
      after={<ClosingCta id="philosophy-cta" />}
    >
      <Section>
        <MarketingCard className="p-6 sm:p-8">
          <p className="pv2-eyebrow">
            <T k="site.philosophy.short.eyebrow" />
          </p>
          <p className="mt-3 text-base leading-relaxed text-[var(--color-text-secondary)] sm:text-lg">
            <T k="site.philosophy.short.body" />
          </p>
        </MarketingCard>
      </Section>

      <ProseSection
        id="phi-rent"
        eyebrow={<T k="site.philosophy.rent.eyebrow" />}
        title={<T k="site.philosophy.rent.title" />}
      >
        <div className={proseBody}>
          <p>
            <T k="site.philosophy.rent.p1" />
          </p>
          <p>
            <T k="site.philosophy.rent.p2" />
          </p>
          <p>
            <T k="site.philosophy.rent.p3" />
          </p>
        </div>

        <PullQuote>
          <T k="site.philosophy.rent.quote" />
        </PullQuote>

        <div className={proseBody}>
          <p>
            <T k="site.philosophy.rent.p4" />
          </p>
          <p>
            <T k="site.philosophy.rent.p5" />
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="phi-loophole"
        eyebrow={<T k="site.philosophy.loophole.eyebrow" />}
        title={<T k="site.philosophy.loophole.title" />}
      >
        <div className={proseBody}>
          <p>
            <T k="site.philosophy.loophole.p1" />
          </p>
          <p>
            <T k="site.philosophy.loophole.p2" />
          </p>
        </div>

        <PullQuote>
          <T k="site.philosophy.loophole.quote" />
        </PullQuote>

        <div className={proseBody}>
          <p>
            <T k="site.philosophy.loophole.p3" />
          </p>
          <p>
            <T k="site.philosophy.loophole.p4" />
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="phi-zero-knowledge"
        eyebrow={<T k="site.philosophy.zk.eyebrow" />}
        title={<T k="site.philosophy.zk.title" />}
      >
        <div className={proseBody}>
          <p>
            <T k="site.philosophy.zk.p1" />
          </p>
          <p>
            <T k="site.philosophy.zk.p2" />
          </p>
        </div>

        <PullQuote>
          <T k="site.philosophy.zk.quote" />
        </PullQuote>

        <div className={proseBody}>
          <p>
            <T k="site.philosophy.zk.p3" />
          </p>
          <p>
            <T k="site.philosophy.zk.p4" />
          </p>
        </div>
      </ProseSection>

      <ProseSection
        id="phi-open-source"
        eyebrow={<T k="site.philosophy.open.eyebrow" />}
        title={<T k="site.philosophy.open.title" />}
      >
        <div className={proseBody}>
          <p>
            <T k="site.philosophy.open.p1" />
          </p>
          <p>
            <T k="site.philosophy.open.p2" />
          </p>
          <p>
            <T k="site.philosophy.open.p3" />
          </p>
        </div>

        <PullQuote>
          <T k="site.philosophy.open.quote" />
        </PullQuote>
      </ProseSection>

      <ProseSection
        id="phi-endgame"
        eyebrow={<T k="site.philosophy.endgame.eyebrow" />}
        title={<T k="site.philosophy.endgame.title" />}
      >
        <div className={proseBody}>
          <p>
            <T k="site.philosophy.endgame.p1" />
          </p>
          <p>
            <T k="site.philosophy.endgame.p2" />
          </p>
          <p>
            <T k="site.philosophy.endgame.p3" />
          </p>
          <p>
            <T k="site.philosophy.endgame.p4" />
          </p>
        </div>

        <PullQuote>
          <T k="site.philosophy.endgame.quote" />
        </PullQuote>
      </ProseSection>

      <ProseSection
        id="phi-who"
        eyebrow={<T k="site.philosophy.who.eyebrow" />}
        title={<T k="site.philosophy.who.title" />}
      >
        <div className={proseBody}>
          <p>
            <T k="site.philosophy.who.p1" />
          </p>
          <p>
            <T k="site.philosophy.who.p2" />
          </p>
        </div>

        <Link
          href="/about"
          className={`${cardSurface} pv2-card-link group mt-8 flex items-center justify-between gap-4 p-5 sm:p-6`}
        >
          <div className="min-w-0">
            <WosmoWordmark className="h-6 w-auto text-[var(--color-text)]" />
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              <T k="site.philosophy.who.cardCaption" />
            </p>
          </div>
          <span className="inline-flex flex-shrink-0 items-center gap-1 text-sm font-semibold text-[var(--pv2-accent-ink)]">
            <T k="site.philosophy.who.readStory" />
            <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </span>
        </Link>
      </ProseSection>
    </ReadingPage>
  );
}
