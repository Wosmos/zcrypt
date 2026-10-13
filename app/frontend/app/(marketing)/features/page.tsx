import { pageMetadata } from "@/lib/page-metadata";
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
import { FeaturesIndexSearch } from "@/components/marketing/features/index-search";
import { T } from "@/components/i18n/t";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { IconWell, cardSurfaceSm } from "@/components/marketing/ui/card";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { cn } from "@/lib/utils";
import { SITE_URL } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Features. The Encrypted Cloud Drive",
  description:
    "Everything zcrypt does: a real encrypted file explorer with folders, in-browser previews, per-folder passwords, sharing, bring-your-own-storage, a transfer manager, and apps for web, desktop, and Android.",
  path: "/features",
  keywords: [
    "encrypted drive features",
    "encrypted file manager",
    "encrypted folders",
    "encrypted file viewer",
    "zero-knowledge storage features",
  ],
  ogTitle: "zcrypt Features. The Encrypted Cloud Drive",
  ogDescription:
    "A real encrypted file explorer: folders, previews, per-folder passwords, sharing, bring-your-own-storage, and apps for every surface.",
});

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
        eyebrow={<T k="site.features.index.eyebrow" />}
        title={<T k="site.features.index.title" />}
        lede={<T k="site.features.index.lede" />}
      >
        <div className="mx-auto mt-8 max-w-xl">
          <FeaturesIndexSearch />
        </div>
      </PageHero>

      <section className="pv2-sec pv2-sec-join" aria-labelledby="h-all">
        <div className="pv2-wrap">
          <h2 id="h-all" className="sr-only">
            <T k="site.features.index.allFeatures" />
          </h2>
          <ul className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {featuresNav.map(({ href, icon }) => {
              const slug = href.split("/").pop();
              return (
                <li key={href}>
                  <Link href={href} className={cn(cardSurfaceSm, "group block h-full p-6 sm:p-7")}>
                    <IconWell icon={ICONS[icon]} />
                    <h3 className="pv2-h3 mt-5 flex items-center gap-2 text-lg">
                      <T k={`site.chrome.featuresNav.${slug}.title`} />
                      <ArrowRight className="rtl:-scale-x-100 ms-auto h-4 w-4 text-[var(--pv2-accent-ink)] transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
                    </h3>
                    <p className="pv2-body mt-2">
                      <T k={`site.chrome.featuresNav.${slug}.desc`} />
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <ClosingCta
        title={<T k="site.features.index.ctaTitle" />}
        subtext={<T k="site.features.index.ctaSubtext" />}
      />
    </>
  );
}
