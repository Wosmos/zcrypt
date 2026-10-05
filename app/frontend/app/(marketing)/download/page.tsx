import type { Metadata } from "next";
import { Check, Github, ShieldCheck } from "@/lib/icons";
import { GITHUB_REPO, downloadPageContent } from "@/lib/data";
import { SoftwareApplicationJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { DownloadCta } from "@/components/marketing/download/download-cta";
import { DownloadCount } from "@/components/marketing/download/download-count";
import { DesktopGrid } from "@/components/marketing/download/desktop-grid";
import { AndroidDownload } from "@/components/marketing/download/android-download";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { PillLink } from "@/components/marketing/ui/pill-link";
import { IconWell, cardSurface } from "@/components/marketing/ui/card";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { ClosingCta } from "@/components/marketing/landing/closing-cta";
import { getLatestRelease } from "@/lib/releases";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Download zcrypt. Desktop Apps for macOS, Windows & Linux",
  description:
    "Get the zcrypt encrypted drive on every device. Native desktop apps for macOS, Windows, and Linux, an Android app, and a web app that needs no install. Free, open source, zero-knowledge.",
  keywords: [
    "download zcrypt",
    "encrypted cloud storage download",
    "zcrypt desktop app",
    "zcrypt for macOS",
    "zcrypt for Windows",
    "zcrypt for Linux",
    "encrypted drive download",
    "zero-knowledge storage app",
    "AppImage",
    "dmg",
    "open source",
  ],
  alternates: { canonical: `${SITE_URL}/download` },
  openGraph: {
    title: "Download zcrypt. Apps for macOS, Windows, Linux & Android",
    description:
      "Native desktop apps, an Android app, and a no-install web app. Free, open source, zero-knowledge encrypted storage on every device.",
    url: `${SITE_URL}/download`,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Download zcrypt. Encrypted storage for every device",
    description:
      "Desktop apps for macOS, Windows, Linux, Android, and a web app. Free and open source.",
  },
};

export default async function DownloadPage() {
  const release = await getLatestRelease();
  const { hero, desktop, android, web, openSource } = downloadPageContent;

  return (
    <>
      <SoftwareApplicationJsonLd />
      <BreadcrumbJsonLd
        items={[
          { name: "zcrypt", url: SITE_URL },
          { name: "Download", url: `${SITE_URL}/download` },
        ]}
      />

      <PageHero
        eyebrow={hero.badge}
        title="Your drive, on every device"
        lede={hero.subtext}
        actions={<DownloadCta release={release} />}
      >
        <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--color-text-secondary)]">
          {hero.trustItems.map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[var(--pv2-accent-ink)]" strokeWidth={3} />
              {t}
            </li>
          ))}
        </ul>
      </PageHero>

      <section id="desktop" className="pv2-sec" aria-labelledby="h-desktop">
        <div className="pv2-wrap">
          <SectionHead
            id="h-desktop"
            eyebrow="Desktop"
            title={desktop.heading}
            lede={desktop.subheading}
          />

          <DesktopGrid release={release} />

          <p className="mx-auto mt-8 max-w-xl text-center text-[13px] text-[var(--color-text-muted)]">
            Looking for a specific build or an older version? Browse{" "}
            <a
              href={`${GITHUB_REPO}/releases`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[var(--pv2-accent-ink)] underline-offset-2 hover:underline"
            >
              all releases on GitHub
            </a>
            .
          </p>
        </div>
      </section>

      <section id="android" className="pv2-sec pv2-sec-join" aria-labelledby="h-android">
        <div className="pv2-wrap pv2-wrap-narrow">
          <SectionHead
            id="h-android"
            eyebrow={android.badge}
            title={android.heading}
            lede={android.subheading}
          />
          <AndroidDownload />
        </div>
      </section>

      <section className="pv2-sec pv2-sec-join" aria-labelledby="h-open">
        <div className="pv2-wrap pv2-wrap-narrow">
          <div className={`${cardSurface} p-8 text-center sm:p-10`}>
            <IconWell icon={ShieldCheck} className="mx-auto mb-5" />
            <SectionHead
              id="h-open"
              title={openSource.heading}
              lede={openSource.body}
              className="pv2-head-flush"
            />
            <div className="mt-5 flex justify-center">
              <DownloadCount />
            </div>
            <div className="pv2-ctas">
              <PillLink href={GITHUB_REPO} variant="secondary" icon={Github} external>
                {openSource.githubCta}
              </PillLink>
              <PillLink href="/docs/self-hosting" variant="secondary" arrow>
                {openSource.selfHostCta}
              </PillLink>
            </div>
          </div>
        </div>
      </section>

      <ClosingCta eyebrow="No install" title={web.heading} subtext={web.body} label="Start free" />
    </>
  );
}
