import type { Metadata } from "next";

import "@/components/marketing/landing/base.css";
import "@/components/marketing/landing/hero.css";
import "@/components/marketing/landing/how.css";
import "@/components/marketing/landing/cards.css";
import "@/components/marketing/landing/social.css";
import { DriveHero } from "@/components/marketing/landing/drive/drive-hero";
import { HowItWorks } from "@/components/marketing/landing/how/how-it-works";
import { TrustCards } from "@/components/marketing/landing/cards/trust-cards";
import { InsideBento } from "@/components/marketing/landing/cards/inside-bento";
import { StoryRail } from "@/components/marketing/landing/social/story-rail";
import { Compared } from "@/components/marketing/landing/social/compared";
import { PriceZero } from "@/components/marketing/landing/social/price-zero";
import { QuoteMarquee } from "@/components/marketing/landing/social/quote-marquee";
import { Faq } from "@/components/marketing/landing/social/faq";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { StickyCta } from "@/components/marketing/landing/sticky-cta";
import { ScrollRefresh } from "@/components/marketing/landing/scroll-refresh";
import { OffscreenPause } from "@/components/marketing/landing/offscreen-pause";
import { FAQJsonLd, SoftwareApplicationJsonLd } from "@/components/seo/json-ld";
import { faqs } from "@/lib/data";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "zcrypt. Free cloud storage with no limit",
  description:
    "Free cloud storage with no limit. Your files get locked on your own phone or laptop, then saved in accounts you already have, like Telegram or GitHub. Nobody else can open them. Not even us. Open source, AES-256-GCM, no card.",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: "zcrypt. Free cloud storage with no limit",
    description:
      "Real folders, instant previews, encrypted on your device and stored in accounts you already own. Zero-knowledge AES-256-GCM, open source, no artificial limits.",
    url: SITE_URL,
  },
};

export default function HomePage() {
  return (
    <div className="pv2">
      <SoftwareApplicationJsonLd />
      <FAQJsonLd faqs={faqs} />
      <DriveHero />
      <HowItWorks />
      <TrustCards />
      <InsideBento />
      <StoryRail />
      <Compared />
      <PriceZero />
      <QuoteMarquee />
      <Faq />
      <ClosingCta id="start" label="Start free" className="pb-12" />
      <StickyCta />
      <ScrollRefresh />
      <OffscreenPause />
    </div>
  );
}
