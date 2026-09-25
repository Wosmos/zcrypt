import type { Metadata } from "next";
import Link from "next/link";

import "@/components/marketing/preview/vault.css";
import "@/components/marketing/v2/v2.css";
import { HeroV2 } from "@/components/marketing/v2/hero-v2";
import { StoryStrip } from "@/components/marketing/v2/story-strip";
import { PipelineV2 } from "@/components/marketing/v2/pipeline-v2";
import { InteractiveBento } from "@/components/marketing/v2/interactive-bento";
import { ShareCipher } from "@/components/marketing/v2/share-cipher";
import { TrustStack } from "@/components/marketing/v2/trust-stack";
import { PriceV2 } from "@/components/marketing/v2/price-v2";
import { StickyStart } from "@/components/marketing/preview/sticky-start";
import { ScrollReveal } from "@/components/marketing/landing/scroll-reveal";
import { ArrowRight } from "@/lib/icons";

export const metadata: Metadata = {
  title: "zcrypt preview v2",
  description:
    "Unlimited free cloud storage that cannot read your files. Sealed on your device, stored in accounts you already own.",
  robots: { index: false, follow: false },
};

/**
 * preview-v2. The landing, rebuilt around what people come for.
 *
 * Order of what a visitor must get: it is a drive, it is free and unlimited,
 * and it cannot read your files. The page is arranged in that order. Screen
 * one is loud type over the real explorer. The one signature scene explains
 * the unlimited claim rather than the encryption claim. Encryption is proven,
 * not announced: the live encryptor sits under sharing, where the question
 * actually comes up.
 *
 * Reuses the live site's nav, footer, SCALE cards and bento. No em dashes,
 * every sequence has a reduced-motion final frame, hero text is real DOM.
 */

export default function PreviewV2Page() {
  return (
    <div className="v2 vault">
      <HeroV2 />
      <StoryStrip />
      <PipelineV2 />
      <TrustStack />
      <InteractiveBento />
      <ShareCipher />

      <PriceV2 />

      {/* Close */}
      <section className="px-4 pb-32 pt-12 text-center sm:px-6">
        <ScrollReveal>
          <h2 className="font-heading text-4xl font-bold tracking-tight text-[var(--color-text)] sm:text-6xl">
            Free. Unlimited. Yours.
          </h2>
          <p className="mx-auto mt-4 max-w-[44ch] text-lg text-[var(--color-text-secondary)]">
            No card, no trial, and nothing to read on our side.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-7 py-4 text-base font-semibold text-[#04181b] transition-[box-shadow,transform] hover:-translate-y-px hover:shadow-[0_0_36px_-6px_var(--color-accent)]"
            >
              Start free, no card <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/features"
              className="px-3 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            >
              Look around first, no signup
            </Link>
          </div>
        </ScrollReveal>
      </section>

      <StickyStart />
    </div>
  );
}
