import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  HardDrive,
  FolderOpen,
  Eye,
  Share2,
  Lock,
  RefreshCcw,
  Send,
  Monitor,
  Shield,
} from "@/lib/icons";
import { BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { featuresNav } from "@/lib/data";
import DocsSearch from "@/components/docs/docs-search-modal";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { IconWell, cardSurfaceSm } from "@/components/marketing/ui/card";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Features. The Encrypted Cloud Drive",
  description:
    "Everything zcrypt does: a real encrypted file explorer with folders, in-browser previews, per-folder passwords, sharing, bring-your-own-storage, a transfer manager, and apps for web, desktop, and Android.",
  keywords: [
    "encrypted drive features",
    "encrypted file manager",
    "encrypted folders",
    "encrypted file viewer",
    "zero-knowledge storage features",
  ],
  alternates: { canonical: `${SITE_URL}/features` },
  openGraph: {
    title: "zcrypt Features. The Encrypted Cloud Drive",
    description:
      "A real encrypted file explorer: folders, previews, per-folder passwords, sharing, bring-your-own-storage, and apps for every surface.",
    url: `${SITE_URL}/features`,
    type: "website",
  },
};

// icon is a string key on featuresNav (lib/data.ts): map it to the actual
// component here, same convention used across the rest of lib/data.ts.
const ICONS: Record<string, typeof HardDrive> = {
  HardDrive,
  FolderOpen,
  Eye,
  Share2,
  Lock,
  RefreshCcw,
  Send,
  Monitor,
  Shield,
};

export default function FeaturesPage() {
  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Home", url: SITE_URL },
          { name: "Features", url: `${SITE_URL}/features` },
        ]}
      />

      <PageHero
        eyebrow="Features"
        title="Everything the drive does"
        lede="A real file manager where only you can open what's inside. Here's every part of it, so dig into whichever matters to you."
      >
        <div className="mx-auto mt-8 max-w-xl">
          <DocsSearch placeholder="Search features & docs..." />
        </div>
      </PageHero>

      <section className="pv2-sec pv2-sec-join" aria-labelledby="h-all">
        <div className="pv2-wrap">
          <h2 id="h-all" className="sr-only">
            All features
          </h2>
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuresNav.map(({ href, icon, title, desc }) => (
              <li key={href}>
                <Link href={href} className={cn(cardSurfaceSm, "group block h-full p-6 sm:p-7")}>
                  <IconWell icon={ICONS[icon]} />
                  <h3 className="pv2-h3 mt-5 flex items-center gap-2 text-lg">
                    {title}
                    <ArrowRight className="ml-auto h-4 w-4 text-[var(--pv2-accent-ink)] transition-transform group-hover:translate-x-0.5" />
                  </h3>
                  <p className="pv2-body mt-2">{desc}</p>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <ClosingCta
        title="Start with a drive you actually own"
        subtext="Free and open source. Bring a storage account you already have."
      />
    </>
  );
}
