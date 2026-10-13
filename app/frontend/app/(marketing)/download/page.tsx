import { pageMetadata } from "@/lib/page-metadata";
import Link from "next/link";
import { Check, Github, ShieldCheck } from "@/lib/icons";
import { GITHUB_REPO, desktopEngine } from "@/lib/data";
import { SoftwareApplicationJsonLd, BreadcrumbJsonLd } from "@/components/seo/json-ld";
import { DownloadCta } from "@/components/marketing/download/download-cta";
import { DownloadCount } from "@/components/marketing/download/download-count";
import { DesktopGrid } from "@/components/marketing/download/desktop-grid";
import { AndroidDownload } from "@/components/marketing/download/android-download";
import { QuickInstall } from "@/components/marketing/download/quick-install";
import { PageHero } from "@/components/marketing/ui/page-hero";
import { PillLink } from "@/components/marketing/ui/pill-link";
import { IconWell, cardSurface } from "@/components/marketing/ui/card";
import { SectionHead } from "@/components/marketing/landing/section-head";
import { DownloadClosing } from "@/components/marketing/download/download-closing";
import { T } from "@/components/i18n/t";
import { getLatestRelease } from "@/lib/releases";
import { SITE_URL } from "@/lib/site";

export const metadata = pageMetadata({
  title: "Download zcrypt. Desktop Apps for macOS, Windows & Linux",
  description:
    "Get the zcrypt encrypted drive on every device. Native desktop apps for macOS, Windows, and Linux, an Android app, and a web app that needs no install. Free, open source, zero-knowledge.",
  path: "/download",
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
  ogTitle: "Download zcrypt. Apps for macOS, Windows, Linux & Android",
  ogDescription:
    "Native desktop apps, an Android app, and a no-install web app. Free, open source, zero-knowledge encrypted storage on every device.",
  twitterTitle: "Download zcrypt. Encrypted storage for every device",
  twitterDescription:
    "Desktop apps for macOS, Windows, Linux, Android, and a web app. Free and open source.",
});

export default async function DownloadPage() {
  const release = await getLatestRelease();
  const trustKeys = ["free", "onlyYou", "noTelemetry"] as const;

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
        fill
        eyebrow={<T k="site.download.hero.badge" />}
        title={<T k="site.download.hero.title" />}
        highlight={<T k="site.download.hero.highlight" />}
        lede={<T k="site.download.hero.subtext" />}
        actions={<DownloadCta release={release} />}
      >
        <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--color-text-secondary)]">
          {trustKeys.map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <Check className="h-3.5 w-3.5 text-[var(--pv2-accent-ink)]" strokeWidth={3} />
              <T k={`site.download.hero.trust.${k}`} />
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 text-[var(--pv2-accent-ink)]" strokeWidth={3} />
            macOS · Windows · Linux
          </li>
          <li>
            <Link
              href="/changelog"
              className="font-medium text-[var(--pv2-accent-ink)] underline-offset-2 hover:underline"
            >
              <T k="changelog.page.downloadLink" />
            </Link>
          </li>
        </ul>
      </PageHero>

      <section id="desktop" className="pv2-sec" aria-labelledby="h-desktop">
        <div className="pv2-wrap">
          <SectionHead
            id="h-desktop"
            eyebrow={<T k="site.download.desktop.eyebrow" />}
            title={<T k="site.download.desktop.heading" />}
            lede={
              <T
                k="site.download.desktop.subheading"
                values={{ engine: desktopEngine.name, language: desktopEngine.language }}
              />
            }
          />

          <DesktopGrid release={release} />

          <div id="install" className="mt-8 scroll-mt-28">
            <QuickInstall />
          </div>

          <p className="mx-auto mt-8 max-w-xl text-center text-[13px] text-[var(--color-text-muted)]">
            <T
              k="site.download.desktop.allReleases"
              links={{ releases: `${GITHUB_REPO}/releases` }}
              linkClassName="font-medium text-[var(--pv2-accent-ink)] underline-offset-2 hover:underline"
            />
          </p>
        </div>
      </section>

      <section id="android" className="pv2-sec pv2-sec-join" aria-labelledby="h-android">
        <div className="pv2-wrap pv2-wrap-narrow">
          <SectionHead
            id="h-android"
            eyebrow="Android"
            title={<T k="site.download.android.heading" />}
            lede={<T k="site.download.android.subheading" />}
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
              title={<T k="site.download.openSource.heading" />}
              lede={<T k="site.download.openSource.body" />}
              className="pv2-head-flush"
            />
            <div className="mt-5 flex justify-center">
              <DownloadCount />
            </div>
            <div className="pv2-ctas">
              <PillLink href={GITHUB_REPO} variant="secondary" icon={Github} external>
                <T k="site.download.openSource.githubCta" />
              </PillLink>
              <PillLink href="/docs/self-hosting" variant="secondary" arrow>
                <T k="site.download.openSource.selfHostCta" />
              </PillLink>
            </div>
          </div>
        </div>
      </section>

      <DownloadClosing />
    </>
  );
}
