import type { Metadata } from "next";

import "@/components/marketing/v2/base.css";
import "@/components/marketing/v2/hero.css";
import "@/components/marketing/v2/how.css";
import "@/components/marketing/v2/cards.css";
import "@/components/marketing/v2/social.css";
import { DriveHero } from "@/components/marketing/v2/drive/drive-hero";
import { HowItWorks } from "@/components/marketing/v2/how/how-it-works";
import { TrustCards } from "@/components/marketing/v2/cards/trust-cards";
import { InsideBento } from "@/components/marketing/v2/cards/inside-bento";
import { StoryRail } from "@/components/marketing/v2/social/story-rail";
import { Compared } from "@/components/marketing/v2/social/compared";
import { PriceZero } from "@/components/marketing/v2/social/price-zero";
import { QuoteMarquee } from "@/components/marketing/v2/social/quote-marquee";
import { Faq } from "@/components/marketing/v2/social/faq";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { StickyCta } from "@/components/marketing/v2/sticky-cta";
import { ScrollRefresh } from "@/components/marketing/v2/scroll-refresh";

export const metadata: Metadata = {
  title: "zcrypt preview v2",
  description:
    "Unlimited free cloud storage that cannot read your files. Sealed on your device, stored in accounts you already own.",
  robots: { index: false, follow: false },
};

export default function PreviewV2Page() {
  return (
    <div className="pv2">
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
    </div>
  );
}
